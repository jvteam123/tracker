document.addEventListener('DOMContentLoaded', () => {
    const ProjectTrackerApp = {
        // --- CONFIGURATION ---
        config: {
            google: {
                API_KEY: "AIzaSyBxlhWwf3mlS_6Q3BiUsfpH21AsbhVmDw8",
                CLIENT_ID: "221107133299-7r4vnbhpsdrnqo8tss0dqbtrr9ou683e.apps.googleusercontent.com",
                SPREADSHEET_ID: "15bhPCYDLChEwO6_uQfvUyq5_qMQp4h816uM26yq3rNY",
                SCOPES: "https://www.googleapis.com/auth/spreadsheets",
            },
            pins: { TL_DASHBOARD_PIN: "1234" },
            sheetNames: { PROJECTS: "Projects", USERS: "Users", DISPUTES: "Disputes" },
            FIX_CATEGORIES: {
                ORDER: ["Fix1", "Fix2", "Fix3", "Fix4", "Fix5", "Fix6"],
                COLORS: { "Fix1": "#FFFFE0", "Fix2": "#ADD8E6", "Fix3": "#90EE90", "Fix4": "#FFB6C1", "Fix5": "#FFDAB9", "Fix6": "#E6E6FA", "default": "#FFFFFF" }
            },
            HEADER_MAP: { 'id': 'id', 'Fix Cat': 'fixCategory', 'Project Name': 'baseProjectName', 'Area/Task': 'areaTask', 'GSD': 'gsd', 'Assigned To': 'assignedTo', 'Status': 'status', 'Day 1 Start': 'startTimeDay1', 'Day 1 Finish': 'finishTimeDay1', 'Day 1 Break': 'breakDurationMinutesDay1', 'Day 2 Start': 'startTimeDay2', 'Day 2 Finish': 'finishTimeDay2', 'Day 2 Break': 'breakDurationMinutesDay2', 'Day 3 Start': 'startTimeDay3', 'Day 3 Finish': 'finishTimeDay3', 'Day 3 Break': 'breakDurationMinutesDay3', 'Day 4 Start': 'startTimeDay4', 'Day 4 Finish': 'finishTimeDay4', 'Day 4 Break': 'breakDurationMinutesDay4', 'Day 5 Start': 'startTimeDay5', 'Day 5 Finish': 'finishTimeDay5', 'Day 5 Break': 'breakDurationMinutesDay5', 'Day 6 Start': 'startTimeDay6', 'Day 6 Finish': 'finishTimeDay6', 'Day 6 Break': 'breakDurationMinutesDay6', 'Total (min)': 'totalMinutes', 'Last Modified': 'lastModifiedTimestamp', 'Batch ID': 'batchId', 'Released': 'releasedToNextStage' }
        },
        tokenClient: null,
        state: { projects: [], users: [], disputes: [], isAppInitialized: false },
        elements: {},

        init() {
            this.setupDOMReferences();
            this.attachEventListeners();
            gapi.load('client', this.initializeGapiClient.bind(this));
        },

        async initializeGapiClient() {
            await gapi.client.init({ apiKey: this.config.google.API_KEY, discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'] });
            this.tokenClient = google.accounts.oauth2.initTokenClient({ client_id: this.config.google.CLIENT_ID, scope: this.config.google.SCOPES, callback: this.handleTokenResponse.bind(this) });
            const storedToken = localStorage.getItem('google_auth_token');
            if (storedToken) gapi.client.setToken(JSON.parse(storedToken));
            this.updateAuthUI();
        },

        updateAuthUI() {
            if (gapi.client.getToken()) this.handleAuthorizedUser();
            else this.handleSignedOutUser();
        },

        handleAuthClick() {
            if (gapi.client.getToken() === null) this.tokenClient.requestAccessToken({ prompt: 'consent' });
            else this.tokenClient.requestAccessToken({ prompt: '' });
        },

        async handleTokenResponse(resp) {
            if (resp.error) throw (resp);
            localStorage.setItem('google_auth_token', JSON.stringify(gapi.client.getToken()));
            await this.handleAuthorizedUser();
        },

        handleSignoutClick() {
            const token = gapi.client.getToken();
            if (token) {
                google.accounts.oauth2.revoke(token.access_token);
                gapi.client.setToken('');
                localStorage.removeItem('google_auth_token');
                this.handleSignedOutUser();
            }
        },

        async handleAuthorizedUser() {
            this.elements.body.classList.remove('login-view-active');
            this.elements.mainContainer.style.display = 'flex';
            this.elements.authWrapper.style.display = 'none';
            if (!this.state.isAppInitialized) {
                await this.loadDataFromSheets();
                this.state.isAppInitialized = true;
            }
        },

        handleSignedOutUser() {
            this.elements.body.classList.add('login-view-active');
            this.elements.authWrapper.style.display = 'block';
            this.elements.mainContainer.style.display = 'none';
            this.state.isAppInitialized = false;
        },

        sheetValuesToObjects(values, headerMap) {
            if (!values || values.length < 2) return [];
            const headers = values[0];
            return values.slice(1).map((row, index) => {
                let obj = { _row: index + 2 };
                headers.forEach((header, i) => { const propName = headerMap[header]; if (propName) obj[propName] = row[i] || ""; });
                return obj;
            });
        },

        async loadDataFromSheets() {
            this.showLoading("Loading data...");
            try {
                const response = await gapi.client.sheets.spreadsheets.values.batchGet({ spreadsheetId: this.config.google.SPREADSHEET_ID, ranges: [this.config.sheetNames.PROJECTS, this.config.sheetNames.USERS] });
                const [projectsData, usersData] = response.result.valueRanges;
                this.state.projects = this.sheetValuesToObjects(projectsData.values, this.config.HEADER_MAP);
                this.state.users = this.sheetValuesToObjects(usersData.values, { 'id': 'id', 'name': 'name', 'email': 'email', 'techId': 'techId' });
                this.renderProjects();
            } catch (err) {
                console.error("Error loading data:", err);
                alert("Could not load data.");
            } finally { this.hideLoading(); }
        },
        
        async updateRowInSheet(sheetName, rowIndex, dataObject) {
            this.showLoading("Saving...");
            try {
                const headers = (await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${sheetName}!1:1` })).result.values[0];
                const invertedHeaderMap = Object.entries(this.config.HEADER_MAP).reduce((acc, [key, value]) => ({...acc, [value]: key }), {});
                const values = [headers.map(header => dataObject[this.config.HEADER_MAP[header]] || dataObject[header] || "")];
                await gapi.client.sheets.spreadsheets.values.update({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${sheetName}!A${rowIndex}`, valueInputOption: 'USER_ENTERED', resource: { values } });
            } catch (err) {
                console.error(`Error updating row ${rowIndex}:`, err);
                alert("Failed to save changes.");
            } finally { this.hideLoading(); }
        },
        
        async appendRowsToSheet(sheetName, rows) {
             try {
                await gapi.client.sheets.spreadsheets.values.append({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: sheetName, valueInputOption: 'USER_ENTERED', resource: { values: rows } });
            } catch (err) { throw new Error("Failed to add data to Google Sheet."); }
        },

        setupDOMReferences() {
            this.elements = {
                body: document.body, authWrapper: document.getElementById('auth-wrapper'), mainContainer: document.querySelector('.dashboard-wrapper'),
                signInBtn: document.getElementById('signInBtn'), signOutBtn: document.getElementById('signOutBtn'),
                projectTableBody: document.getElementById('projectTableBody'), loadingOverlay: document.getElementById('loadingOverlay'),
                openNewProjectModalBtn: document.getElementById('openNewProjectModalBtn'), projectFormModal: document.getElementById('projectFormModal'),
                closeProjectFormBtn: document.getElementById('closeProjectFormBtn'), newProjectForm: document.getElementById('newProjectForm'),
                openTechDashboardBtn: document.getElementById('openTechDashboardBtn'), techDashboard: document.getElementById('techDashboard'),
                openTlDashboardBtn: document.getElementById('openTlDashboardBtn'), tlDashboard: document.getElementById('tlDashboard'),
                tlDashboardContent: document.getElementById('tlDashboardContent'),
                openSettingsBtn: document.getElementById('openSettingsBtn'), userManagementDashboard: document.getElementById('userManagementDashboard'),
            };
        },

        attachEventListeners() {
            this.elements.signInBtn.onclick = this.handleAuthClick.bind(this);
            this.elements.signOutBtn.onclick = this.handleSignoutClick.bind(this);
            this.elements.openNewProjectModalBtn.onclick = () => this.elements.projectFormModal.style.display = 'block';
            this.elements.closeProjectFormBtn.onclick = () => this.elements.projectFormModal.style.display = 'none';
            this.elements.newProjectForm.addEventListener('submit', (e) => this.handleAddProjectSubmit(e));
            this.elements.openTechDashboardBtn.onclick = () => this.showDashboard('techDashboard');
            this.elements.openTlDashboardBtn.onclick = () => { if (prompt("Enter PIN") === this.config.pins.TL_DASHBOARD_PIN) { this.showDashboard('tlDashboard'); this.renderTLDashboard(); } else { alert("Incorrect PIN."); }};
            this.elements.openSettingsBtn.onclick = () => { if (prompt("Enter PIN") === this.config.pins.TL_DASHBOARD_PIN) { this.showDashboard('userManagementDashboard'); } else { alert("Incorrect PIN."); }};
        },
        
        showDashboard(id) {
            document.querySelectorAll('.dashboard-container').forEach(d => d.classList.remove('active'));
            document.getElementById(id).classList.add('active');
        },

        async handleAddProjectSubmit(event) {
            event.preventDefault(); this.showLoading("Adding project(s)...");
            const numRows = parseInt(document.getElementById('numRows').value, 10), baseProjectName = document.getElementById('baseProjectName').value.trim(), gsd = document.getElementById('gsd').value;
            const headers = (await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${this.config.sheetNames.PROJECTS}!1:1` })).result.values[0];
            const newRows = [];
            for (let i = 1; i <= numRows; i++) {
                const newRowObj = { id: `proj_${Date.now()}_${i}`, batchId: `batch_${Date.now()}`, baseProjectName, areaTask: `Area${String(i).padStart(2, '0')}`, gsd, fixCategory: "Fix1", status: "Available", lastModifiedTimestamp: new Date().toISOString() };
                newRows.push(headers.map(header => newRowObj[this.config.HEADER_MAP[header]] || ""));
            }
            try { await this.appendRowsToSheet(this.config.sheetNames.PROJECTS, newRows); this.elements.projectFormModal.style.display = 'none'; await this.loadDataFromSheets(); } catch (error) { alert("Error adding projects: " + error.message); }
        },

        async handleProjectUpdate(projectId, updates) {
            const project = this.state.projects.find(p => p.id === projectId);
            if (project) {
                Object.assign(project, updates, { lastModifiedTimestamp: new Date().toISOString() });
                await this.updateRowInSheet(this.config.sheetNames.PROJECTS, project._row, project);
                this.renderProjects();
            }
        },

        getCurrentTimeGMT8() { return new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' }); },

        async updateProjectState(projectId, action) {
            const project = this.state.projects.find(p => p.id === projectId);
            if (!project) return;
            const updates = {};
            const dayMatch = action.match(/(start|end)Day(\d)/);
            if (dayMatch) {
                const [, type, day] = dayMatch;
                updates.status = type === 'start' ? `InProgressDay${day}` : (parseInt(day) < 6 ? `Day${day}Ended_AwaitingNext` : 'Completed');
                if (type === 'start') updates[`startTimeDay${day}`] = this.getCurrentTimeGMT8();
                if (type === 'end') updates[`finishTimeDay${day}`] = this.getCurrentTimeGMT8();
            } else if (action === 'markDone') {
                updates.status = "Completed";
            }
            await this.handleProjectUpdate(projectId, updates);
        },

        renderProjects() {
            const tableBody = this.elements.projectTableBody;
            tableBody.innerHTML = "";
            this.state.projects.sort((a,b) => (a.baseProjectName+a.areaTask).localeCompare(b.baseProjectName+b.areaTask)).forEach(project => {
                const row = tableBody.insertRow();
                ['fixCategory', 'baseProjectName', 'areaTask', 'gsd'].forEach(key => row.insertCell().textContent = project[key]);
                const assignedToSelect = document.createElement('select');
                assignedToSelect.innerHTML = '<option value="">Unassigned</option>' + this.state.users.map(u => `<option value="${u.techId}" ${project.assignedTo === u.techId ? 'selected' : ''}>${u.techId}</option>`).join('');
                assignedToSelect.onchange = (e) => this.handleProjectUpdate(project.id, { 'assignedTo': e.target.value });
                row.insertCell().appendChild(assignedToSelect);
                row.insertCell().innerHTML = `<span class="status status-${(project.status || "").toLowerCase()}">${project.status}</span>`;
                for (let i = 1; i <= 6; i++) { row.insertCell().textContent = project[`startTimeDay${i}`]; row.insertCell().textContent = project[`finishTimeDay${i}`]; row.insertCell().textContent = project[`breakDurationMinutesDay${i}`]; }
                
                // Calculate Total Minutes
                let totalMinutes = 0;
                for (let i = 1; i <= 6; i++) {
                    const start = project[`startTimeDay${i}`];
                    const end = project[`finishTimeDay${i}`];
                    if (start && end) {
                        const [startH, startM] = start.split(':').map(Number);
                        const [endH, endM] = end.split(':').map(Number);
                        const duration = (endH * 60 + endM) - (startH * 60 + startM);
                        totalMinutes += duration;
                    }
                    totalMinutes -= parseInt(project[`breakDurationMinutesDay${i}`] || 0);
                }
                
                row.insertCell().textContent = '...'; // Progress Placeholder
                row.insertCell().textContent = Math.max(0, totalMinutes);
                
                const actionsCell = row.insertCell();
                for (let i = 1; i <= 6; i++) {
                    const startBtn = document.createElement('button');
                    startBtn.textContent = `Start D${i}`;
                    startBtn.className = 'btn btn-primary btn-small';
                    startBtn.disabled = !(project.status === 'Available' && i === 1) && !(project.status === `Day${i-1}Ended_AwaitingNext`);
                    startBtn.onclick = () => this.updateProjectState(project.id, `startDay${i}`);
                    actionsCell.appendChild(startBtn);

                    const endBtn = document.createElement('button');
                    endBtn.textContent = `End D${i}`;
                    endBtn.className = 'btn btn-warning btn-small';
                    endBtn.disabled = project.status !== `InProgressDay${i}`;
                    endBtn.onclick = () => this.updateProjectState(project.id, `endDay${i}`);
                    actionsCell.appendChild(endBtn);
                }
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
                    releaseBtn.onclick = () => this.releaseBatchToNextFix(projectName, latestFix, nextFix);
                    projectDiv.appendChild(releaseBtn);
                } else { projectDiv.innerHTML += "<p>All fix stages completed.</p>"; }
                content.appendChild(projectDiv);
            }
        },
        
        async releaseBatchToNextFix(projectName, currentFix, nextFix) {
            if (!confirm(`Are you sure you want to release tasks for "${projectName}" from ${currentFix} to ${nextFix}?`)) return;
            const tasksToRelease = this.state.projects.filter(p => p.baseProjectName === projectName && p.fixCategory === currentFix);
            if (tasksToRelease.length === 0) { alert("No tasks found to release."); return; }
            this.showLoading(`Releasing ${tasksToRelease.length} tasks...`);
            const headers = (await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${this.config.sheetNames.PROJECTS}!1:1` })).result.values[0];
            const newRows = [], updates = [];
            tasksToRelease.forEach(task => {
                const newRowObj = { ...task, fixCategory: nextFix, status: 'Available', id: `proj_${Date.now()}_${Math.random()}` };
                for(let i=1; i<=6; i++) { newRowObj[`startTimeDay${i}`] = ''; newRowObj[`finishTimeDay${i}`] = ''; newRowObj[`breakDurationMinutesDay${i}`] = '0'; }
                newRows.push(headers.map(h => newRowObj[this.config.HEADER_MAP[h]] || ""));
                task.releasedToNextStage = "TRUE";
                updates.push({ rowIndex: task._row, dataObject: task });
            });
            try {
                await this.appendRowsToSheet(this.config.sheetNames.PROJECTS, newRows);
                // Batch update is more complex, for now we update one by one
                for (const update of updates) {
                    await this.updateRowInSheet(this.config.sheetNames.PROJECTS, update.rowIndex, update.dataObject);
                }
                alert("Tasks released successfully!");
                await this.loadDataFromSheets();
            } catch (e) { alert("An error occurred during release."); }
        },

        showLoading(message = "Loading...") { if (this.elements.loadingOverlay) { this.elements.loadingOverlay.style.display = 'flex'; } },
        hideLoading() { if (this.elements.loadingOverlay) { this.elements.loadingOverlay.style.display = 'none'; } },
    };

    ProjectTrackerApp.init();
});
