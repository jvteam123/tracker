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
            sheetNames: { PROJECTS: "Projects", USERS: "Users" },
            HEADER_MAP: { 'id': 'id', 'Fix Cat': 'fixCategory', 'Project Name': 'baseProjectName', 'Area/Task': 'areaTask', 'GSD': 'gsd', 'Assigned To': 'assignedTo', 'Status': 'status', 'Day 1 Start': 'startTimeDay1', 'Day 1 Finish': 'finishTimeDay1', 'Day 1 Break': 'breakDurationMinutesDay1', 'Day 2 Start': 'startTimeDay2', 'Day 2 Finish': 'finishTimeDay2', 'Day 2 Break': 'breakDurationMinutesDay2', 'Day 3 Start': 'startTimeDay3', 'Day 3 Finish': 'finishTimeDay3', 'Day 3 Break': 'breakDurationMinutesDay3', 'Day 4 Start': 'startTimeDay4', 'Day 4 Finish': 'finishTimeDay4', 'Day 4 Break': 'breakDurationMinutesDay4', 'Day 5 Start': 'startTimeDay5', 'Day 5 Finish': 'finishTimeDay5', 'Day 5 Break': 'breakDurationMinutesDay5', 'Total (min)': 'totalMinutes', 'Last Modified': 'lastModifiedTimestamp', 'Batch ID': 'batchId' }
        },
        tokenClient: null,
        state: { projects: [], users: [], isAppInitialized: false },
        elements: {},

        init() {
            this.setupDOMReferences();
            this.attachEventListeners();
            gapi.load('client', this.initializeGapiClient.bind(this));
        },

        async initializeGapiClient() {
            await gapi.client.init({
                apiKey: this.config.google.API_KEY,
                discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
            });
            this.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: this.config.google.CLIENT_ID,
                scope: this.config.google.SCOPES,
                callback: this.handleTokenResponse.bind(this),
            });
            this.updateAuthUI();
        },

        updateAuthUI() {
            const token = gapi.client.getToken();
            if (token) {
                this.handleAuthorizedUser();
            } else {
                this.handleSignedOutUser();
            }
        },

        handleAuthClick() {
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        },

        async handleTokenResponse(resp) {
            if (resp.error) return;
            gapi.client.setToken(resp);
            this.handleAuthorizedUser();
        },

        handleSignoutClick() {
            const token = gapi.client.getToken();
            if (token !== null) {
                google.accounts.oauth2.revoke(token.access_token);
                gapi.client.setToken('');
                this.handleSignedOutUser();
            }
        },

        async handleAuthorizedUser() {
            document.body.classList.remove('login-view-active');
            this.elements.authWrapper.style.display = 'none';
            this.elements.dashboardWrapper.style.display = 'flex';
            if (!this.state.isAppInitialized) {
                await this.loadDataFromSheets();
                this.state.isAppInitialized = true;
            }
        },

        handleSignedOutUser() {
            document.body.classList.add('login-view-active');
            this.elements.authWrapper.style.display = 'block';
            this.elements.dashboardWrapper.style.display = 'none';
            this.state.isAppInitialized = false;
        },

        sheetValuesToObjects(values, headerMap) {
            if (!values || values.length < 2) return [];
            const headers = values[0];
            return values.slice(1).map((row, index) => {
                let obj = { _row: index + 2 };
                headers.forEach((header, i) => {
                    const propName = headerMap[header.trim()];
                    if (propName) obj[propName] = row[i] || "";
                });
                return obj;
            });
        },

        async loadDataFromSheets() {
            this.showLoading("Loading data...");
            try {
                const response = await gapi.client.sheets.spreadsheets.values.batchGet({
                    spreadsheetId: this.config.google.SPREADSHEET_ID,
                    ranges: [this.config.sheetNames.PROJECTS, this.config.sheetNames.USERS],
                });
                const { valueRanges } = response.result;
                const projectsData = valueRanges.find(r => r.range.startsWith(this.config.sheetNames.PROJECTS));
                const usersData = valueRanges.find(r => r.range.startsWith(this.config.sheetNames.USERS));
                this.state.projects = projectsData?.values ? this.sheetValuesToObjects(projectsData.values, this.config.HEADER_MAP) : [];
                this.state.users = usersData?.values ? this.sheetValuesToObjects(usersData.values, { 'id': 'id', 'name': 'name', 'email': 'email', 'techId': 'techId' }) : [];
                this.renderProjects();
            } catch (err) {
                alert("Could not load data. Check Spreadsheet ID, sheet names, and permissions.");
            } finally {
                this.hideLoading();
            }
        },

        async updateRowInSheet(sheetName, rowIndex, dataObject) {
            try {
                const getHeaders = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: this.config.google.SPREADSHEET_ID,
                    range: `${sheetName}!1:1`,
                });
                const headers = getHeaders.result.values[0];
                const values = [headers.map(header => dataObject[this.config.HEADER_MAP[header.trim()]] || "")];
                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: this.config.google.SPREADSHEET_ID,
                    range: `${sheetName}!A${rowIndex}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values }
                });
            } catch (err) {
                alert("Failed to save changes. Refreshing data.");
                await this.loadDataFromSheets();
            }
        },

        async appendRowsToSheet(sheetName, rows) {
            try {
                await gapi.client.sheets.spreadsheets.values.append({
                    spreadsheetId: this.config.google.SPREADSHEET_ID,
                    range: sheetName,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: rows }
                });
            } catch (err) {
                throw new Error("Failed to add data to Google Sheet.");
            }
        },

        setupDOMReferences() {
            this.elements = {
                body: document.body,
                authWrapper: document.getElementById('auth-wrapper'),
                dashboardWrapper: document.querySelector('.dashboard-wrapper'),
                signInBtn: document.getElementById('signInBtn'),
                signOutBtn: document.getElementById('signOutBtn'),
                projectTableBody: document.getElementById('projectTableBody'),
                loadingOverlay: document.getElementById('loadingOverlay'),
                openNewProjectModalBtn: document.getElementById('openNewProjectModalBtn'),
                projectFormModal: document.getElementById('projectFormModal'),
                closeProjectFormBtn: document.getElementById('closeProjectFormBtn'),
                newProjectForm: document.getElementById('newProjectForm'),
            };
        },

        attachEventListeners() {
            this.elements.signInBtn.onclick = () => this.handleAuthClick();
            this.elements.signOutBtn.onclick = () => this.handleSignoutClick();
            this.elements.openNewProjectModalBtn.onclick = () => this.elements.projectFormModal.style.display = 'block';
            this.elements.closeProjectFormBtn.onclick = () => this.elements.projectFormModal.style.display = 'none';
            this.elements.newProjectForm.addEventListener('submit', (e) => this.handleAddProjectSubmit(e));
        },

        async handleAddProjectSubmit(event) {
            event.preventDefault();
            this.showLoading("Adding project(s)...");
            const numRows = parseInt(document.getElementById('numRows').value, 10);
            const baseProjectName = document.getElementById('baseProjectName').value.trim();
            const gsd = document.getElementById('gsd').value;
            const batchId = `batch_${Date.now()}`;
            try {
                const getHeaders = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: this.config.google.SPREADSHEET_ID,
                    range: `${this.config.sheetNames.PROJECTS}!1:1`,
                });
                const headers = getHeaders.result.values[0];
                const newRows = [];
                for (let i = 1; i <= numRows; i++) {
                    const newRowObj = {
                        id: `proj_${Date.now()}_${i}`, batchId, baseProjectName,
                        areaTask: `Area${String(i).padStart(2, '0')}`, gsd,
                        fixCategory: "Fix1", status: "Available",
                        lastModifiedTimestamp: new Date().toISOString()
                    };
                    newRows.push(headers.map(header => newRowObj[this.config.HEADER_MAP[header.trim()]] || ""));
                }
                await this.appendRowsToSheet(this.config.sheetNames.PROJECTS, newRows);
                this.elements.projectFormModal.style.display = 'none';
                this.elements.newProjectForm.reset();
                await this.loadDataFromSheets();
            } catch (error) {
                alert("Error adding projects: " + error.message);
            } finally {
                this.hideLoading();
            }
        },

        async handleProjectUpdate(projectId, updates) {
            const project = this.state.projects.find(p => p.id === projectId);
            if (project) {
                Object.assign(project, updates, { lastModifiedTimestamp: new Date().toISOString() });
                this.renderProjects();
                await this.updateRowInSheet(this.config.sheetNames.PROJECTS, project._row, project);
            }
        },

        getCurrentTime() {
            return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        },

        async updateProjectState(projectId, action) {
            const project = this.state.projects.find(p => p.id === projectId);
            if (!project) return;
            const updates = {};
            const dayMatch = action.match(/(start|end)Day(\d)/);
            if (dayMatch) {
                const [, type, day] = dayMatch;
                const dayNum = parseInt(day, 10);
                updates.status = type === 'start' ? `InProgressDay${dayNum}` : (dayNum < 5 ? `Day${dayNum}Ended_AwaitingNext` : 'Completed');
                updates[type === 'start' ? `startTimeDay${dayNum}` : `finishTimeDay${dayNum}`] = this.getCurrentTime();
            }
            await this.handleProjectUpdate(projectId, updates);
        },

        parseTimeToMinutes(timeStr) {
            if (!timeStr || !timeStr.includes(':')) return 0;
            const [hours, minutes] = timeStr.split(':').map(Number);
            return (hours * 60) + minutes;
        },

        renderProjects() {
            const tableBody = this.elements.projectTableBody;
            tableBody.innerHTML = "";
            if (this.state.projects.length === 0) {
                const row = tableBody.insertRow();
                row.innerHTML = `<td colspan="23" style="text-align:center;padding:20px;">No projects found.</td>`;
                return;
            }
            this.state.projects.sort((a, b) => (a.baseProjectName + a.areaTask).localeCompare(b.baseProjectName + b.areaTask))
                .forEach(project => {
                    const row = tableBody.insertRow();
                    ['fixCategory', 'baseProjectName', 'areaTask', 'gsd'].forEach(key => row.insertCell().textContent = project[key] || '');
                    const assignedToSelect = document.createElement('select');
                    assignedToSelect.innerHTML = '<option value="">Unassigned</option>' + this.state.users.map(u => `<option value="${u.techId}" ${project.assignedTo === u.techId ? 'selected' : ''}>${u.techId}</option>`).join('');
                    assignedToSelect.onchange = (e) => this.handleProjectUpdate(project.id, { 'assignedTo': e.target.value });
                    row.insertCell().appendChild(assignedToSelect);
                    row.insertCell().innerHTML = `<span class="status status-${(project.status || "").toLowerCase()}">${project.status}</span>`;
                    
                    let totalWorkMinutes = 0;
                    let totalBreakMinutes = 0;

                    for (let i = 1; i <= 5; i++) {
                        const startTime = project[`startTimeDay${i}`] || '';
                        const finishTime = project[`finishTimeDay${i}`] || '';
                        const breakMins = parseInt(project[`breakDurationMinutesDay${i}`] || '0', 10);
                        
                        row.insertCell().textContent = startTime;
                        row.insertCell().textContent = finishTime;
                        row.insertCell().textContent = breakMins > 0 ? `${breakMins}m` : '';

                        if (startTime && finishTime) {
                            totalWorkMinutes += this.parseTimeToMinutes(finishTime) - this.parseTimeToMinutes(startTime);
                        }
                        totalBreakMinutes += breakMins;
                    }

                    const totalNetMinutes = totalWorkMinutes - totalBreakMinutes;
                    row.insertCell().textContent = totalNetMinutes > 0 ? totalNetMinutes : '';

                    const actionsCell = row.insertCell();
                    for (let i = 1; i <= 5; i++) {
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

        showLoading(message = "Loading...") {
            if (this.elements.loadingOverlay) {
                this.elements.loadingOverlay.querySelector('p').textContent = message;
                this.elements.loadingOverlay.style.display = 'flex';
            }
        },

        hideLoading() {
            if (this.elements.loadingOverlay) {
                this.elements.loadingOverlay.style.display = 'none';
            }
        }
    };

    ProjectTrackerApp.init();
});
