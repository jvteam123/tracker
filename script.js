document.addEventListener('DOMContentLoaded', () => {
    const ProjectTrackerApp = {
        // --- CONFIGURATION (Already set with your details) ---
        config: {
            google: {
                API_KEY: "AIzaSyBxlhWwf3mlS_6Q3BiUsfpH21AsbhVmDw8",
                CLIENT_ID: "221107133299-7r4vnbhpsdrnqo8tss0dqbtrr9ou683e.apps.googleusercontent.com",
                SPREADSHEET_ID: "15bhPCYDLChEwO6_uQfvUyq5_qMQp4h816uM26yq3rNY",
                SCOPES: "https://www.googleapis.com/auth/spreadsheets",
            },
            pins: { TL_DASHBOARD_PIN: "1234" },
            sheetNames: { PROJECTS: "Projects", USERS: "Users" },
            HEADER_MAP: { 'id': 'id', 'Fix Cat': 'fixCategory', 'Project Name': 'baseProjectName', 'Area/Task': 'areaTask', 'GSD': 'gsd', 'Assigned To': 'assignedTo', 'Status': 'status', 'Day 1 Start': 'startTimeDay1', 'Day 1 Finish': 'finishTimeDay1', 'Day 1 Break': 'breakDurationMinutesDay1', 'Day 2 Start': 'startTimeDay2', 'Day 2 Finish': 'finishTimeDay2', 'Day 2 Break': 'breakDurationMinutesDay2', 'Day 3 Start': 'startTimeDay3', 'Day 3 Finish': 'finishTimeDay3', 'Day 3 Break': 'breakDurationMinutesDay3', 'Day 4 Start': 'startTimeDay4', 'Day 4 Finish': 'finishTimeDay4', 'Day 4 Break': 'breakDurationMinutesDay4', 'Day 5 Start': 'startTimeDay5', 'Day 5 Finish': 'finishTimeDay5', 'Day 5 Break': 'breakDurationMinutesDay5', 'Day 6 Start': 'startTimeDay6', 'Day 6 Finish': 'finishTimeDay6', 'Day 6 Break': 'breakDurationMinutesDay6', 'Total (min)': 'totalMinutes', 'Last Modified': 'lastModifiedTimestamp', 'Batch ID': 'batchId', 'Released': 'releasedToNextStage' }
        },
        tokenClient: null,
        state: { projects: [], users: [], isAppInitialized: false, isGapiInitialized: false, isGisInitialized: false },
        elements: {},

        // =================================================================================
        // == INITIALIZATION & AUTH ========================================================
        // =================================================================================
        init() {
            this.setupDOMReferences();
            this.attachEventListeners();
            gapi.load('client', this.initializeGapiClient.bind(this));
            google.accounts.id.initialize({
                client_id: this.config.google.CLIENT_ID,
                callback: this.handleAuthClick.bind(this)
            });
        },

        async initializeGapiClient() {
            await gapi.client.init({ apiKey: this.config.google.API_KEY, discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'] });
            this.state.isGapiInitialized = true;
            const storedToken = localStorage.getItem('google_auth_token');
            if (storedToken) gapi.client.setToken(JSON.parse(storedToken));
            this.updateAuthUI();
        },

        updateAuthUI() {
            if (gapi.client.getToken()) this.handleAuthorizedUser();
            else this.handleSignedOutUser();
        },

        handleAuthClick() {
            this.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: this.config.google.CLIENT_ID,
                scope: this.config.google.SCOPES,
                callback: async (resp) => {
                    if (resp.error) throw (resp);
                    localStorage.setItem('google_auth_token', JSON.stringify(gapi.client.getToken()));
                    await this.handleAuthorizedUser();
                }
            });
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

        // =================================================================================
        // == DATA HANDLING ================================================================
        // =================================================================================
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
        
        async appendRowsToSheet(sheetName, rows) {
             try {
                await gapi.client.sheets.spreadsheets.values.append({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: sheetName, valueInputOption: 'USER_ENTERED', resource: { values: rows } });
            } catch (err) { throw new Error("Failed to add data to Google Sheet."); }
        },

        // =================================================================================
        // == UI AND EVENT LOGIC ===========================================================
        // =================================================================================
        setupDOMReferences() {
            this.elements = {
                body: document.body, authWrapper: document.getElementById('auth-wrapper'), mainContainer: document.querySelector('.dashboard-wrapper'),
                signInBtn: document.getElementById('signInBtn'), signOutBtn: document.getElementById('signOutBtn'),
                projectTableBody: document.getElementById('projectTableBody'), loadingOverlay: document.getElementById('loadingOverlay'),
                openNewProjectModalBtn: document.getElementById('openNewProjectModalBtn'), projectFormModal: document.getElementById('projectFormModal'),
                closeProjectFormBtn: document.getElementById('closeProjectFormBtn'), newProjectForm: document.getElementById('newProjectForm'),
                openTlDashboardBtn: document.getElementById('openTlDashboardBtn'), tlDashboard: document.getElementById('tlDashboard'),
                tlDashboardContent: document.getElementById('tlDashboardContent'),
            };
        },

        attachEventListeners() {
            this.elements.signInBtn.onclick = this.handleAuthClick.bind(this);
            this.elements.signOutBtn.onclick = this.handleSignoutClick.bind(this);
            this.elements.openNewProjectModalBtn.onclick = () => this.elements.projectFormModal.style.display = 'block';
            this.elements.closeProjectFormBtn.onclick = () => this.elements.projectFormModal.style.display = 'none';
            this.elements.newProjectForm.addEventListener('submit', (e) => this.handleAddProjectSubmit(e));
        },

        async handleAddProjectSubmit(event) {
            event.preventDefault(); this.showLoading("Adding project(s)...");
            const numRows = parseInt(document.getElementById('numRows').value, 10), baseProjectName = document.getElementById('baseProjectName').value.trim(), gsd = document.getElementById('gsd').value;
            const headers = (await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${this.config.sheetNames.PROJECTS}!1:1` })).result.values[0];
            const newRows = [];
            for (let i = 1; i <= numRows; i++) {
                const newRowObj = { id: `proj_${Date.now()}_${i}`, batchId: `batch_${Date.now()}`, baseProjectName, areaTask: `Area${String(i).padStart(2, '0')}`, gsd, fixCategory: "Fix1", status: "Available", creationTimestamp: new Date().toISOString() };
                newRows.push(headers.map(h => this.config.HEADER_MAP[h] ? newRowObj[this.config.HEADER_MAP[h]] : ""));
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
            const updates = {};
            const dayMatch = action.match(/(start|end)Day(\d)/);
            if (dayMatch) {
                const [, type, day] = dayMatch;
                updates.status = type === 'start' ? `InProgressDay${day}` : (day < 6 ? `Day${day}Ended_AwaitingNext` : 'Completed');
                updates[`startTimeDay${day}`] = type === 'start' ? this.getCurrentTimeGMT8() : this.state.projects.find(p=>p.id===projectId)[`startTimeDay${day}`];
                updates[`finishTimeDay${day}`] = type === 'end' ? this.getCurrentTimeGMT8() : '';
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
                row.insertCell().innerHTML = `<span class="status">${project.status}</span>`;
                for (let i = 1; i <= 6; i++) {
                    row.insertCell().textContent = project[`startTimeDay${i}`];
                    row.insertCell().textContent = project[`finishTimeDay${i}`];
                    row.insertCell().textContent = project[`breakDurationMinutesDay${i}`];
                }
                row.insertCell(); row.insertCell(); // Placeholders
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

        showLoading(message = "Loading...") { if (this.elements.loadingOverlay) { this.elements.loadingOverlay.style.display = 'flex'; } },
        hideLoading() { if (this.elements.loadingOverlay) { this.elements.loadingOverlay.style.display = 'none'; } },
    };

    ProjectTrackerApp.init();
});
