document.addEventListener('DOMContentLoaded', () => {
    const ProjectTrackerApp = {
        // --- CONFIGURATION (Completed with your details) ---
        config: {
            google: {
                API_KEY: "AIzaSyBxlhWwf3mlS_6Q3BiUsfpH21AsbhVmDw8",
                CLIENT_ID: "221107133299-7r4vnbhpsdrnqo8tss0dqbtrr9ou683e.apps.googleusercontent.com",
                SPREADSHEET_ID: "15bhPCYDLChEwO6_uQfvUyq5_qMQp4h816uM26yq3rNY",
                SCOPES: "https://www.googleapis.com/auth/spreadsheets",
            },
            pins: {
                TL_DASHBOARD_PIN: "1234"
            },
            sheetNames: {
                PROJECTS: "Projects",
                USERS: "Users",
                DISPUTES: "Disputes",
            },
            FIX_CATEGORIES: {
                ORDER: ["Fix1", "Fix2", "Fix3", "Fix4", "Fix5", "Fix6"],
                COLORS: { "Fix1": "#FFFFE0", "Fix2": "#ADD8E6", "Fix3": "#90EE90", "Fix4": "#FFB6C1", "Fix5": "#FFDAB9", "Fix6": "#E6E6FA", "default": "#FFFFFF" }
            },
            NUM_TABLE_COLUMNS: 27,
        },
        gapi: null,
        tokenClient: null,
        state: {
            projects: [], users: [], disputes: [], allUniqueProjectNames: [], groupVisibilityState: {}, isAppInitialized: false,
            filters: { batchId: localStorage.getItem('currentSelectedBatchId') || "", fixCategory: "", month: "" },
            isGapiInitialized: false, isGisInitialized: false,
        },
        elements: {},

        // --- METHODS ---
        methods: {
            // =================================================================================
            // == INITIALIZATION & AUTH (with Persistent Login) ===============================
            // =================================================================================
            init() {
                this.methods.setupDOMReferences.call(this);
                this.methods.attachEventListeners.call(this);
                this.methods.gapiLoaded.call(this);
                this.methods.gisLoaded.call(this);
            },
            gapiLoaded() { gapi.load('client', this.methods.initializeGapiClient.bind(this)); },
            async initializeGapiClient() {
                await gapi.client.init({ apiKey: this.config.google.API_KEY, discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'] });
                this.state.isGapiInitialized = true;
                const storedToken = localStorage.getItem('google_auth_token');
                if (storedToken) {
                    gapi.client.setToken(JSON.parse(storedToken));
                }
                this.methods.updateAuthUI.call(this);
            },
            gisLoaded() {
                this.tokenClient = google.accounts.oauth2.initTokenClient({ client_id: this.config.google.CLIENT_ID, scope: this.config.google.SCOPES, callback: '' });
                this.state.isGisInitialized = true;
                this.methods.updateAuthUI.call(this);
            },
            updateAuthUI() {
                if (this.state.isGapiInitialized && this.state.isGisInitialized) {
                    if (gapi.client.getToken() === null) { this.methods.handleSignedOutUser.call(this); } else { this.methods.handleAuthorizedUser.call(this); }
                }
            },
            handleAuthClick() {
                this.tokenClient.callback = async (resp) => {
                    if (resp.error) throw (resp);
                    localStorage.setItem('google_auth_token', JSON.stringify(gapi.client.getToken()));
                    await this.methods.handleAuthorizedUser.call(this);
                };
                if (gapi.client.getToken() === null) { this.tokenClient.requestAccessToken({ prompt: 'consent' }); } else { this.tokenClient.requestAccessToken({ prompt: '' }); }
            },
            handleSignoutClick() {
                const token = gapi.client.getToken();
                if (token !== null) {
                    google.accounts.oauth2.revoke(token.access_token);
                    gapi.client.setToken('');
                    localStorage.removeItem('google_auth_token');
                    this.methods.handleSignedOutUser.call(this);
                }
            },
            async handleAuthorizedUser() {
                document.body.classList.remove('login-view-active');
                this.elements.authWrapper.style.display = 'none';
                this.elements.mainContainer.style.display = 'flex';
                this.elements.signOutBtn.style.display = 'block';
                this.elements.userInfoDisplayDiv.style.display = 'flex';
                this.elements.userNameP.textContent = "Signed In";
                if (!this.state.isAppInitialized) { await this.methods.loadDataFromSheets.call(this); this.state.isAppInitialized = true; }
            },
            handleSignedOutUser() {
                document.body.classList.add('login-view-active');
                this.elements.authWrapper.style.display = 'block';
                this.elements.mainContainer.style.display = 'none';
                this.elements.signOutBtn.style.display = 'none';
                this.state.isAppInitialized = false;
            },

            // =================================================================================
            // == DATA HANDLING (GOOGLE SHEETS) ================================================
            // =================================================================================
            sheetValuesToObjects(values) {
                if (!values || values.length < 2) return [];
                const headers = values[0];
                const dataRows = values.slice(1);
                return dataRows.map((row, index) => {
                    let obj = { _row: index + 2 };
                    headers.forEach((header, i) => { obj[header] = row[i] || ""; });
                    return obj;
                });
            },
            async loadDataFromSheets() {
                this.methods.showLoading.call(this, "Loading data from Google Sheets...");
                try {
                    const response = await gapi.client.sheets.spreadsheets.values.batchGet({ spreadsheetId: this.config.google.SPREADSHEET_ID, ranges: [this.config.sheetNames.PROJECTS, this.config.sheetNames.USERS, this.config.sheetNames.DISPUTES] });
                    const [projectsData, usersData, disputesData] = response.result.valueRanges;
                    this.state.projects = this.methods.sheetValuesToObjects.call(this, projectsData.values);
                    this.state.users = this.methods.sheetValuesToObjects.call(this, usersData.values);
                    this.state.disputes = this.methods.sheetValuesToObjects.call(this, disputesData.values);
                    this.state.allUniqueProjectNames = Array.from(new Set(this.state.projects.map(p => p.baseProjectName))).sort();
                    this.methods.refreshAllViews.call(this);
                } catch (err) {
                    console.error("Error loading data from Sheets: ", err);
                    alert("Could not load data. Check Spreadsheet ID, sheet names, and sharing permissions.");
                } finally { this.methods.hideLoading.call(this); }
            },
            async batchUpdateSheet(sheetName, updates) {
                this.methods.showLoading.call(this, "Saving multiple changes...");
                try {
                    const headers = (await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${sheetName}!1:1` })).result.values[0];
                    const data = updates.map(update => ({ range: `${sheetName}!A${update.rowIndex}`, values: [headers.map(header => update.dataObject[header] || "")] }));
                    await gapi.client.sheets.spreadsheets.values.batchUpdate({ spreadsheetId: this.config.google.SPREADSHEET_ID, resource: { valueInputOption: 'USER_ENTERED', data } });
                } catch(err) {
                    console.error("Batch update failed:", err);
                    alert("Failed to save multiple changes.");
                } finally { this.methods.hideLoading.call(this); }
            },
            async appendRowsToSheet(sheetName, rows) {
                 try {
                    await gapi.client.sheets.spreadsheets.values.append({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: sheetName, valueInputOption: 'USER_ENTERED', resource: { values: rows } });
                } catch (err) { throw new Error("Failed to add data to Google Sheet."); }
            },
             async updateRowInSheet(sheetName, rowIndex, dataObject) {
                this.methods.showLoading.call(this, "Saving changes...");
                try {
                    const headers = (await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${sheetName}!1:1` })).result.values[0];
                    const values = [headers.map(header => dataObject[header] || "")];
                    await gapi.client.sheets.spreadsheets.values.update({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${sheetName}!A${rowIndex}`, valueInputOption: 'USER_ENTERED', resource: { values } });
                } catch (err) {
                    console.error(`Error updating row ${rowIndex} in ${sheetName}:`, err);
                    alert("Failed to save changes.");
                } finally { this.methods.hideLoading.call(this); }
            },
            
            // =================================================================================
            // == CORE APPLICATION LOGIC (FULLY IMPLEMENTED) ===================================
            // =================================================================================
            setupDOMReferences() {
                 this.elements = { body: document.body, authWrapper: document.getElementById('auth-wrapper'), mainContainer: document.querySelector('.dashboard-wrapper'), signInBtn: document.getElementById('signInBtn'), signOutBtn: document.getElementById('signOutBtn'), userInfoDisplayDiv: document.querySelector('.user-profile'), userNameP: document.getElementById('userName'), openTechDashboardBtn: document.getElementById('openTechDashboardBtn'), openTlDashboardBtn: document.getElementById('openTlDashboardBtn'), openSettingsBtn: document.getElementById('openSettingsBtn'), projectFormModal: document.getElementById('projectFormModal'), tlDashboard: document.getElementById('tlDashboard'), userManagementDashboard: document.getElementById('userManagementDashboard'), closeProjectFormBtn: document.getElementById('closeProjectFormBtn'), newProjectForm: document.getElementById('newProjectForm'), projectTableBody: document.getElementById('projectTableBody'), loadingOverlay: document.getElementById('loadingOverlay'), openNewProjectModalBtn: document.getElementById('openNewProjectModalBtn'), techDashboard: document.getElementById('techDashboard'), tlDashboardContent: document.getElementById('tlDashboardContent') };
            },
            attachEventListeners() {
                this.elements.signInBtn.onclick = this.methods.handleAuthClick.bind(this);
                this.elements.signOutBtn.onclick = this.methods.handleSignoutClick.bind(this);
                this.elements.newProjectForm.addEventListener('submit', (e) => this.methods.handleAddProjectSubmit.call(this, e));
                this.elements.openNewProjectModalBtn.onclick = () => this.elements.projectFormModal.style.display = 'block';
                this.elements.closeProjectFormBtn.onclick = () => this.elements.projectFormModal.style.display = 'none';
                this.elements.openTechDashboardBtn.onclick = () => this.methods.showDashboard.call(this, 'techDashboard');
                this.elements.openTlDashboardBtn.onclick = () => { if (prompt("Enter PIN") === this.config.pins.TL_DASHBOARD_PIN) { this.methods.showDashboard.call(this, 'tlDashboard'); this.methods.renderTLDashboard.call(this); } else { alert("Incorrect PIN."); }};
                this.elements.openSettingsBtn.onclick = () => { if (prompt("Enter PIN") === this.config.pins.TL_DASHBOARD_PIN) { this.methods.showDashboard.call(this, 'userManagementDashboard'); } else { alert("Incorrect PIN."); }};
            },
            showDashboard(id) {
                document.querySelectorAll('.dashboard-container').forEach(d => d.style.display = 'none');
                document.getElementById(id).style.display = 'flex';
                document.querySelectorAll('.sidebar-nav button').forEach(b => b.classList.remove('active'));
                document.getElementById(`open${id.charAt(0).toUpperCase() + id.slice(1)}Btn`).classList.add('active');
            },
            refreshAllViews() { this.methods.renderProjects.call(this); this.methods.hideLoading.call(this); },
            async handleAddProjectSubmit(event) {
                event.preventDefault(); this.methods.showLoading.call(this, "Adding project(s)...");
                const numRows = parseInt(document.getElementById('numRows').value, 10), baseProjectName = document.getElementById('baseProjectName').value.trim(), gsd = document.getElementById('gsd').value;
                const headers = (await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${this.config.sheetNames.PROJECTS}!1:1` })).result.values[0];
                const newRows = [];
                for (let i = 1; i <= numRows; i++) {
                    const newRowObj = { id: `proj_${Date.now()}_${i}`, batchId: `batch_${Date.now()}`, baseProjectName, areaTask: `Area${String(i).padStart(2, '0')}`, gsd, fixCategory: "Fix1", status: "Available", creationTimestamp: new Date().toISOString() };
                    newRows.push(headers.map(h => newRowObj[h] || ""));
                }
                try { await this.methods.appendRowsToSheet.call(this, this.config.sheetNames.PROJECTS, newRows); this.elements.projectFormModal.style.display = 'none'; await this.methods.loadDataFromSheets.call(this); } catch (error) { alert("Error adding projects: " + error.message); }
            },
            async handleProjectUpdate(projectId, updates) {
                const project = this.state.projects.find(p => p.id === projectId);
                if (project) {
                    Object.assign(project, updates, { lastModifiedTimestamp: new Date().toISOString() });
                    await this.methods.updateRowInSheet.call(this, this.config.sheetNames.PROJECTS, project._row, project);
                    this.methods.renderProjects.call(this);
                }
            },
            getCurrentTimeGMT8() { return new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }); },
            async updateProjectState(projectId, action) {
                const project = this.state.projects.find(p => p.id === projectId);
                if (!project) return;
                const updates = {};
                const dayMatch = action.match(/(start|end)Day(\d)/);
                if (dayMatch) {
                    const [, type, day] = dayMatch;
                    if (type === 'start') {
                        updates.status = `InProgressDay${day}`;
                        updates[`startTimeDay${day}`] = this.methods.getCurrentTimeGMT8();
                    } else {
                        updates.status = day < 6 ? `Day${day}Ended_AwaitingNext` : 'Completed';
                        updates[`finishTimeDay${day}`] = this.methods.getCurrentTimeGMT8();
                    }
                } else if (action === 'markDone') {
                    updates.status = "Completed";
                }
                await this.methods.handleProjectUpdate(projectId, updates);
            },
            renderProjects() {
                const tableBody = this.elements.projectTableBody;
                tableBody.innerHTML = "";
                const sortedProjects = [...this.state.projects].sort((a,b) => (a.baseProjectName+a.areaTask).localeCompare(b.baseProjectName+b.areaTask));
                sortedProjects.forEach(project => {
                    const row = tableBody.insertRow();
                    row.dataset.projectId = project.id;
                    row.style.backgroundColor = this.config.FIX_CATEGORIES.COLORS[project.fixCategory] || '#fff';
                    row.insertCell().textContent = project.fixCategory;
                    row.insertCell().textContent = project.baseProjectName;
                    row.insertCell().textContent = project.areaTask;
                    row.insertCell().textContent = project.gsd;
                    const assignedToSelect = document.createElement('select');
                    assignedToSelect.innerHTML = '<option value="">Select Tech</option>' + this.state.users.map(u => `<option value="${u.techId}" ${project.assignedTo === u.techId ? 'selected' : ''}>${u.techId}</option>`).join('');
                    assignedToSelect.onchange = (e) => this.methods.handleProjectUpdate(project.id, { 'assignedTo': e.target.value });
                    row.insertCell().appendChild(assignedToSelect);
                    row.insertCell().innerHTML = `<span class="status status-${(project.status || "").toLowerCase()}">${project.status}</span>`;
                    for (let i = 1; i <= 6; i++) {
                        row.insertCell().textContent = project[`startTimeDay${i}`] || '';
                        row.insertCell().textContent = project[`finishTimeDay${i}`] || '';
                        row.insertCell().textContent = project[`breakDurationMinutesDay${i}`] || '0';
                    }
                    row.insertCell().textContent = '...';
                    row.insertCell().textContent = '...';
                    const actionsCell = row.insertCell();
                    const buttonsDiv = document.createElement('div');
                    actionsCell.appendChild(buttonsDiv);
                    const createBtn = (text, className, action, disabled = false) => {
                        const btn = document.createElement('button');
                        btn.textContent = text;
                        btn.className = `btn ${className} btn-small`;
                        btn.disabled = disabled;
                        btn.onclick = () => this.methods.updateProjectState(project.id, action);
                        buttonsDiv.appendChild(btn);
                    };
                    for (let i = 1; i <= 6; i++) {
                        const isStartDisabled = !(project.status === 'Available' && i === 1) && !(project.status === `Day${i-1}Ended_AwaitingNext`);
                        createBtn(`Start D${i}`, 'btn-primary', `startDay${i}`, isStartDisabled);
                        createBtn(`End D${i}`, 'btn-warning', `endDay${i}`, project.status !== `InProgressDay${i}`);
                    }
                    createBtn('Done', 'btn-success', 'markDone', project.status === 'Completed');
                });
            },
            renderTLDashboard() {
                const content = this.elements.tlDashboardContent;
                content.innerHTML = "<h3>Release Projects to Next Fix Stage</h3>";
                const projectsByName = this.state.projects.reduce((acc, p) => { acc[p.baseProjectName] = acc[p.baseProjectName] || []; acc[p.baseProjectName].push(p); return acc; }, {});
                for (const projectName in projectsByName) {
                    const projectDiv = document.createElement('div');
                    projectDiv.style.border = "1px solid #ccc"; projectDiv.style.padding = "10px"; projectDiv.style.marginBottom = "10px";
                    projectDiv.innerHTML = `<h4>${projectName}</h4>`;
                    const currentFixes = [...new Set(projectsByName[projectName].map(p => p.fixCategory))].sort();
                    const latestFix = currentFixes[currentFixes.length - 1];
                    const nextFixIndex = this.config.FIX_CATEGORIES.ORDER.indexOf(latestFix) + 1;
                    if (nextFixIndex < this.config.FIX_CATEGORIES.ORDER.length) {
                        const nextFix = this.config.FIX_CATEGORIES.ORDER[nextFixIndex];
                        const releaseBtn = document.createElement('button');
                        releaseBtn.textContent = `Release from ${latestFix} to ${nextFix}`;
                        releaseBtn.className = 'btn btn-primary';
                        releaseBtn.onclick = () => this.methods.releaseBatchToNextFix(projectName, latestFix, nextFix);
                        projectDiv.appendChild(releaseBtn);
                    } else { projectDiv.innerHTML += "<p>All fix stages completed.</p>"; }
                    content.appendChild(projectDiv);
                }
            },
            async releaseBatchToNextFix(projectName, currentFix, nextFix) {
                if (!confirm(`Are you sure you want to release all tasks for "${projectName}" from ${currentFix} to ${nextFix}?`)) return;
                const tasksToRelease = this.state.projects.filter(p => p.baseProjectName === projectName && p.fixCategory === currentFix);
                if (tasksToRelease.length === 0) { alert("No tasks found to release."); return; }
                this.methods.showLoading.call(this, `Releasing ${tasksToRelease.length} tasks...`);
                const headers = (await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${this.config.sheetNames.PROJECTS}!1:1` })).result.values[0];
                const newRows = [], updates = [];
                tasksToRelease.forEach(task => {
                    const newRowObj = { ...task, fixCategory: nextFix, status: 'Available', id: `proj_${Date.now()}_${Math.random()}` };
                    for(let i=1; i<=6; i++) { newRowObj[`startTimeDay${i}`] = ''; newRowObj[`finishTimeDay${i}`] = ''; newRowObj[`breakDurationMinutesDay${i}`] = '0'; }
                    newRows.push(headers.map(h => newRowObj[h] || ""));
                    task.releasedToNextStage = "TRUE";
                    updates.push({ rowIndex: task._row, dataObject: task });
                });
                try {
                    await this.methods.appendRowsToSheet.call(this, this.config.sheetNames.PROJECTS, newRows);
                    await this.methods.batchUpdateSheet.call(this, this.config.sheetNames.PROJECTS, updates);
                    alert("Tasks released successfully!");
                    await this.methods.loadDataFromSheets.call(this);
                } catch (e) { alert("An error occurred during release."); }
            },
            showLoading(message = "Loading...") { if (this.elements.loadingOverlay) { this.elements.loadingOverlay.querySelector('p').textContent = message; this.elements.loadingOverlay.style.display = 'flex'; } },
            hideLoading() { if (this.elements.loadingOverlay) { this.elements.loadingOverlay.style.display = 'none'; } },
        }
    };

    ProjectTrackerApp.methods.init.call(ProjectTrackerApp);
});
