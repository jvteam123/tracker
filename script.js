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
        gapi: null, tokenClient: null,
        state: { projects: [], users: [], disputes: [], allUniqueProjectNames: [], isAppInitialized: false, isGapiInitialized: false, isGisInitialized: false },
        elements: {},

        init() {
            this.elements = {
                body: document.body, authWrapper: document.getElementById('auth-wrapper'), mainContainer: document.querySelector('.dashboard-wrapper'),
                signInBtn: document.getElementById('signInBtn'), signOutBtn: document.getElementById('signOutBtn'),
                projectTableBody: document.getElementById('projectTableBody'), loadingOverlay: document.getElementById('loadingOverlay'),
                openNewProjectModalBtn: document.getElementById('openNewProjectModalBtn'), projectFormModal: document.getElementById('projectFormModal'),
                closeProjectFormBtn: document.getElementById('closeProjectFormBtn'), newProjectForm: document.getElementById('newProjectForm'),
                openTlDashboardBtn: document.getElementById('openTlDashboardBtn'), tlDashboard: document.getElementById('tlDashboard'),
                tlDashboardContent: document.getElementById('tlDashboardContent'),
            };
            this.elements.signInBtn.onclick = this.handleAuthClick.bind(this);
            this.elements.signOutBtn.onclick = this.handleSignoutClick.bind(this);
            this.elements.openNewProjectModalBtn.onclick = () => this.elements.projectFormModal.style.display = 'block';
            this.elements.closeProjectFormBtn.onclick = () => this.elements.projectFormModal.style.display = 'none';
            this.elements.newProjectForm.addEventListener('submit', (e) => this.handleAddProjectSubmit(e));
            this.elements.openTlDashboardBtn.onclick = () => { if (prompt("Enter PIN") === this.config.pins.TL_DASHBOARD_PIN) { this.showDashboard('tlDashboard'); this.renderTLDashboard(); } else { alert("Incorrect PIN."); }};
            this.gapiLoaded();
            this.gisLoaded();
        },

        gapiLoaded() { gapi.load('client', this.initializeGapiClient.bind(this)); },
        async initializeGapiClient() {
            await gapi.client.init({ apiKey: this.config.google.API_KEY, discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'] });
            this.state.isGapiInitialized = true;
            const storedToken = localStorage.getItem('google_auth_token');
            if (storedToken) gapi.client.setToken(JSON.parse(storedToken));
            this.updateAuthUI();
        },
        gisLoaded() {
            this.tokenClient = google.accounts.oauth2.initTokenClient({ client_id: this.config.google.CLIENT_ID, scope: this.config.google.SCOPES, callback: '' });
            this.state.isGisInitialized = true;
            this.updateAuthUI();
        },
        updateAuthUI() {
            if (this.state.isGapiInitialized && this.state.isGisInitialized) {
                if (gapi.client.getToken()) this.handleAuthorizedUser(); else this.handleSignedOutUser();
            }
        },
        handleAuthClick() {
            this.tokenClient.callback = async (resp) => {
                if (resp.error) throw (resp);
                localStorage.setItem('google_auth_token', JSON.stringify(gapi.client.getToken()));
                await this.handleAuthorizedUser();
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
                this.handleSignedOutUser();
            }
        },
        async handleAuthorizedUser() {
            this.elements.body.classList.remove('login-view-active');
            this.elements.mainContainer.style.display = 'flex';
            this.elements.authWrapper.style.display = 'none';
            if (!this.state.isAppInitialized) { await this.loadDataFromSheets(); this.state.isAppInitialized = true; }
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
                this.refreshAllViews();
            } catch (err) {
                console.error("Error loading data:", err);
                alert("Could not load data. Check Spreadsheet ID, sheet names, and sharing permissions.");
            } finally { this.hideLoading(); }
        },
        async updateRowInSheet(sheetName, rowIndex, dataObject) {
            this.showLoading("Saving...");
            try {
                const headers = (await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${sheetName}!1:1` })).result.values[0];
                const invertedHeaderMap = Object.entries(this.config.HEADER_MAP).reduce((acc, [key, value]) => { acc[value] = key; return acc; }, {});
                const values = [headers.map(header => dataObject[invertedHeaderMap[header]] || dataObject[header] || "")];
                await gapi.client.sheets.spreadsheets.values.update({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${sheetName}!A${rowIndex}`, valueInputOption: 'USER_ENTERED', resource: { values } });
            } catch (err) {
                console.error(`Error updating row ${rowIndex}:`, err);
                alert("Failed to save changes.");
            } finally { this.hideLoading(); }
        },
        refreshAllViews() { this.renderProjects(); this.hideLoading(); },
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
            const updates = {};
            const dayMatch = action.match(/(start|end)Day(\d)/);
            if (dayMatch) {
                const [, type, day] = dayMatch;
                if (type === 'start') {
                    updates.status = `InProgressDay${day}`;
                    updates[`startTimeDay${day}`] = this.getCurrentTimeGMT8();
                } else {
                    updates.status = day < 6 ? `Day${day}Ended_AwaitingNext` : 'Completed';
                    updates[`finishTimeDay${day}`] = this.getCurrentTimeGMT8();
                }
            } else if (action === 'markDone') updates.status = "Completed";
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
                    startBtn.onclick = () => this.updateProjectState(project.id, `startDay${i}`);
                    actionsCell.appendChild(startBtn);
                }
            });
        },
        showLoading(message = "Loading...") { if (this.elements.loadingOverlay) { this.elements.loadingOverlay.querySelector('p').textContent = message; this.elements.loadingOverlay.style.display = 'flex'; } },
        hideLoading() { if (this.elements.loadingOverlay) { this.elements.loadingOverlay.style.display = 'none'; } },
    };
    ProjectTrackerApp.init();
});
