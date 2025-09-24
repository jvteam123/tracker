document.addEventListener('DOMContentLoaded', () => {
    const ProjectTrackerApp = {
        // --- CONFIGURATION ---
        config: {
            google: {
                API_KEY: "AIzaSyBxlhWwf3mlS_6Q3BiUsfpH21AsbhVmDw8",
                CLIENT_ID: "221107133299-7r4vnbhpsdrnqo8tss0dqbtrr9ou683e.apps.googleusercontent.com",
                SPREADSHEET_ID: "YOUR_NEW_SPREADSHEET_ID", // <-- PASTE THE ID FROM YOUR NEW COPIED SHEET HERE
                SCOPES: "https://www.googleapis.com/auth/spreadsheets",
            },
            pins: { TL_DASHBOARD_PIN: "1234" },
            sheetNames: { PROJECTS: "Projects", USERS: "Users", DISPUTES: "Disputes" },
            FIX_CATEGORIES: {
                ORDER: ["Fix1", "Fix2", "Fix3", "Fix4", "Fix5", "Fix6"],
                COLORS: { "Fix1": "#FFFFE0", "Fix2": "#ADD8E6", "Fix3": "#90EE90", "Fix4": "#FFB6C1", "Fix5": "#FFDAB9", "Fix6": "#E6E6FA", "default": "#FFFFFF" }
            },
            // Maps sheet headers to internal property names
            HEADER_MAP: {
                'id': 'id', 'Fix Cat': 'fixCategory', 'Project Name': 'baseProjectName', 'Area/Task': 'areaTask',
                'GSD': 'gsd', 'Assigned To': 'assignedTo', 'Status': 'status',
                'Day 1 Start': 'startTimeDay1', 'Day 1 Finish': 'finishTimeDay1', 'Day 1 Break': 'breakDurationMinutesDay1',
                'Day 2 Start': 'startTimeDay2', 'Day 2 Finish': 'finishTimeDay2', 'Day 2 Break': 'breakDurationMinutesDay2',
                'Day 3 Start': 'startTimeDay3', 'Day 3 Finish': 'finishTimeDay3', 'Day 3 Break': 'breakDurationMinutesDay3',
                'Day 4 Start': 'startTimeDay4', 'Day 4 Finish': 'finishTimeDay4', 'Day 4 Break': 'breakDurationMinutesDay4',
                'Day 5 Start': 'startTimeDay5', 'Day 5 Finish': 'finishTimeDay5', 'Day 5 Break': 'breakDurationMinutesDay5',
                'Day 6 Start': 'startTimeDay6', 'Day 6 Finish': 'finishTimeDay6', 'Day 6 Break': 'breakDurationMinutesDay6',
                'Total (min)': 'totalMinutes', 'Last Modified': 'lastModifiedTimestamp', 'Batch ID': 'batchId',
                'Released': 'releasedToNextStage'
            }
        },
        gapi: null,
        tokenClient: null,
        state: {
            projects: [], users: [], disputes: [], allUniqueProjectNames: [], isAppInitialized: false,
            isGapiInitialized: false, isGisInitialized: false,
        },
        elements: {},

        // --- METHODS ---
        methods: {
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
                if (storedToken) gapi.client.setToken(JSON.parse(storedToken));
                this.methods.updateAuthUI.call(this);
            },
            gisLoaded() {
                this.tokenClient = google.accounts.oauth2.initTokenClient({ client_id: this.config.google.CLIENT_ID, scope: this.config.google.SCOPES, callback: '' });
                this.state.isGisInitialized = true;
                this.methods.updateAuthUI.call(this);
            },
            updateAuthUI() {
                if (this.state.isGapiInitialized && this.state.isGisInitialized) {
                    if (gapi.client.getToken()) this.methods.handleAuthorizedUser(); else this.methods.handleSignedOutUser();
                }
            },
            handleAuthClick() {
                this.tokenClient.callback = async (resp) => {
                    if (resp.error) throw (resp);
                    localStorage.setItem('google_auth_token', JSON.stringify(gapi.client.getToken()));
                    await this.methods.handleAuthorizedUser();
                };
                if (gapi.client.getToken() === null) this.tokenClient.requestAccessToken({ prompt: 'consent' });
                else this.tokenClient.requestAccessToken({ prompt: '' });
            },
            handleSignoutClick() {
                const token = gapi.client.getToken();
                if (token) {
                    google.accounts.oauth2.revoke(token.access_token);
                    gapi.client.setToken('');
                    localStorage.removeItem('google_auth_token');
                    this.methods.handleSignedOutUser();
                }
            },
            async handleAuthorizedUser() {
                document.body.classList.remove('login-view-active');
                this.elements.mainContainer.style.display = 'flex';
                this.elements.authWrapper.style.display = 'none';
                if (!this.state.isAppInitialized) { await this.methods.loadDataFromSheets(); this.state.isAppInitialized = true; }
            },
            handleSignedOutUser() {
                document.body.classList.add('login-view-active');
                this.elements.authWrapper.style.display = 'block';
                this.elements.mainContainer.style.display = 'none';
                this.state.isAppInitialized = false;
            },

            sheetValuesToObjects(values, headerMap) {
                if (!values || values.length < 2) return [];
                const headers = values[0];
                const dataRows = values.slice(1);
                return dataRows.map((row, index) => {
                    let obj = { _row: index + 2 };
                    headers.forEach((header, i) => {
                        const propName = headerMap[header];
                        if (propName) obj[propName] = row[i] || "";
                    });
                    return obj;
                });
            },
            async loadDataFromSheets() {
                this.methods.showLoading("Loading data...");
                try {
                    const response = await gapi.client.sheets.spreadsheets.values.batchGet({ spreadsheetId: this.config.google.SPREADSHEET_ID, ranges: [this.config.sheetNames.PROJECTS, this.config.sheetNames.USERS] });
                    const [projectsData, usersData] = response.result.valueRanges;
                    this.state.projects = this.methods.sheetValuesToObjects(projectsData.values, this.config.HEADER_MAP);
                    this.state.users = this.methods.sheetValuesToObjects(usersData.values, { 'id': 'id', 'name': 'name', 'email': 'email', 'techId': 'techId' });
                    this.state.allUniqueProjectNames = Array.from(new Set(this.state.projects.map(p => p.baseProjectName))).sort();
                    this.methods.refreshAllViews();
                } catch (err) {
                    console.error("Error loading data:", err);
                    alert("Could not load data. Check Spreadsheet ID, sheet names, and sharing permissions.");
                } finally { this.methods.hideLoading(); }
            },
            async updateRowInSheet(sheetName, rowIndex, dataObject) {
                this.methods.showLoading("Saving...");
                try {
                    const headers = (await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${sheetName}!1:1` })).result.values[0];
                    const invertedHeaderMap = Object.entries(this.config.HEADER_MAP).reduce((acc, [key, value]) => { acc[value] = key; return acc; }, {});
                    const values = [headers.map(header => dataObject[invertedHeaderMap[header]] || dataObject[header] || "")];
                    await gapi.client.sheets.spreadsheets.values.update({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${sheetName}!A${rowIndex}`, valueInputOption: 'USER_ENTERED', resource: { values } });
                } catch (err) {
                    console.error(`Error updating row ${rowIndex}:`, err);
                    alert("Failed to save changes.");
                } finally { this.methods.hideLoading(); }
            },

            setupDOMReferences() { this.elements = { body: document.body, authWrapper: document.getElementById('auth-wrapper'), mainContainer: document.querySelector('.dashboard-wrapper'), signInBtn: document.getElementById('signInBtn'), signOutBtn: document.getElementById('signOutBtn'), userInfoDisplayDiv: document.querySelector('.user-profile'), userNameP: document.getElementById('userName'), openTechDashboardBtn: document.getElementById('openTechDashboardBtn'), openTlDashboardBtn: document.getElementById('openTlDashboardBtn'), openSettingsBtn: document.getElementById('openSettingsBtn'), projectFormModal: document.getElementById('projectFormModal'), tlDashboard: document.getElementById('tlDashboard'), userManagementDashboard: document.getElementById('userManagementDashboard'), closeProjectFormBtn: document.getElementById('closeProjectFormBtn'), newProjectForm: document.getElementById('newProjectForm'), projectTableBody: document.getElementById('projectTableBody'), loadingOverlay: document.getElementById('loadingOverlay'), openNewProjectModalBtn: document.getElementById('openNewProjectModalBtn'), techDashboard: document.getElementById('techDashboard'), tlDashboardContent: document.getElementById('tlDashboardContent') }; },
            attachEventListeners() {
                this.elements.signInBtn.onclick = () => this.methods.handleAuthClick();
                this.elements.signOutBtn.onclick = () => this.methods.handleSignoutClick();
                this.elements.newProjectForm.addEventListener('submit', (e) => this.methods.handleAddProjectSubmit(e));
                this.elements.openNewProjectModalBtn.onclick = () => this.elements.projectFormModal.style.display = 'block';
                this.elements.closeProjectFormBtn.onclick = () => this.elements.projectFormModal.style.display = 'none';
                this.elements.openTechDashboardBtn.onclick = () => this.methods.showDashboard('techDashboard');
                this.elements.openTlDashboardBtn.onclick = () => { if (prompt("Enter PIN") === this.config.pins.TL_DASHBOARD_PIN) { this.methods.showDashboard('tlDashboard'); this.methods.renderTLDashboard(); } else { alert("Incorrect PIN."); }};
            },
            showDashboard(id) {
                document.querySelectorAll('.dashboard-container').forEach(d => d.style.display = 'none');
                document.getElementById(id).style.display = 'flex';
            },
            refreshAllViews() { this.methods.renderProjects(); this.methods.hideLoading(); },
            async handleProjectUpdate(projectId, updates) {
                const project = this.state.projects.find(p => p.id === projectId);
                if (project) {
                    Object.assign(project, updates, { lastModifiedTimestamp: new Date().toISOString() });
                    await this.methods.updateRowInSheet(this.config.sheetNames.PROJECTS, project._row, project);
                    this.methods.renderProjects();
                }
            },
            getCurrentTimeGMT8() { return new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' }); },
            async updateProjectState(projectId, action) {
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
                } else if (action === 'markDone') updates.status = "Completed";
                await this.methods.handleProjectUpdate(projectId, updates);
            },
            renderProjects() {
                const tableBody = this.elements.projectTableBody;
                tableBody.innerHTML = "";
                this.state.projects.sort((a,b) => (a.baseProjectName+a.areaTask).localeCompare(b.baseProjectName+b.areaTask)).forEach(project => {
                    const row = tableBody.insertRow();
                    row.dataset.projectId = project.id;
                    row.style.backgroundColor = this.config.FIX_CATEGORIES.COLORS[project.fixCategory];
                    ['fixCategory', 'baseProjectName', 'areaTask', 'gsd'].forEach(key => row.insertCell().textContent = project[key]);
                    const assignedToSelect = document.createElement('select');
                    assignedToSelect.innerHTML = '<option value="">Unassigned</option>' + this.state.users.map(u => `<option value="${u.techId}" ${project.assignedTo === u.techId ? 'selected' : ''}>${u.techId}</option>`).join('');
                    assignedToSelect.onchange = (e) => this.methods.handleProjectUpdate(project.id, { 'assignedTo': e.target.value });
                    row.insertCell().appendChild(assignedToSelect);
                    row.insertCell().innerHTML = `<span class="status">${project.status}</span>`;
                    for (let i = 1; i <= 6; i++) {
                        row.insertCell().textContent = project[`startTimeDay${i}`];
                        row.insertCell().textContent = project[`finishTimeDay${i}`];
                        row.insertCell().textContent = project[`breakDurationMinutesDay${i}`];
                    }
                    row.insertCell(); row.insertCell(); // Placeholders for Progress, Total
                    const actionsCell = row.insertCell();
                    for (let i = 1; i <= 6; i++) {
                        const startBtn = document.createElement('button');
                        startBtn.textContent = `Start D${i}`;
                        startBtn.disabled = !(project.status === 'Available' && i === 1) && !(project.status === `Day${i-1}Ended_AwaitingNext`);
                        startBtn.onclick = () => this.methods.updateProjectState(project.id, `startDay${i}`);
                        actionsCell.appendChild(startBtn);
                    }
                });
            },
            renderTLDashboard() { /* Simplified */ },
            showLoading(message = "Loading...") { if (this.elements.loadingOverlay) { this.elements.loadingOverlay.querySelector('p').textContent = message; this.elements.loadingOverlay.style.display = 'flex'; } },
            hideLoading() { if (this.elements.loadingOverlay) { this.elements.loadingOverlay.style.display = 'none'; } },
        }
    };
    ProjectTrackerApp.methods.init.call(ProjectTrackerApp);
});
