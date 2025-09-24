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

        // --- METHODS ---
        methods: {
            init() {
                ProjectTrackerApp.methods.setupDOMReferences();
                ProjectTrackerApp.methods.attachEventListeners();
                ProjectTrackerApp.methods.gapiLoaded();
                ProjectTrackerApp.methods.gisLoaded();
            },
            gapiLoaded() { gapi.load('client', ProjectTrackerApp.methods.initializeGapiClient); },
            async initializeGapiClient() {
                await gapi.client.init({ apiKey: ProjectTrackerApp.config.google.API_KEY, discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'] });
                ProjectTrackerApp.state.isGapiInitialized = true;
                const storedToken = localStorage.getItem('google_auth_token');
                if (storedToken) gapi.client.setToken(JSON.parse(storedToken));
                ProjectTrackerApp.methods.updateAuthUI();
            },
            gisLoaded() {
                ProjectTrackerApp.tokenClient = google.accounts.oauth2.initTokenClient({ client_id: ProjectTrackerApp.config.google.CLIENT_ID, scope: ProjectTrackerApp.config.google.SCOPES, callback: '' });
                ProjectTrackerApp.state.isGisInitialized = true;
                ProjectTrackerApp.methods.updateAuthUI();
            },
            updateAuthUI() {
                if (ProjectTrackerApp.state.isGapiInitialized && ProjectTrackerApp.state.isGisInitialized) {
                    if (gapi.client.getToken()) ProjectTrackerApp.methods.handleAuthorizedUser(); else ProjectTrackerApp.methods.handleSignedOutUser();
                }
            },
            handleAuthClick() {
                ProjectTrackerApp.tokenClient.callback = async (resp) => {
                    if (resp.error) throw (resp);
                    localStorage.setItem('google_auth_token', JSON.stringify(gapi.client.getToken()));
                    await ProjectTrackerApp.methods.handleAuthorizedUser();
                };
                if (gapi.client.getToken() === null) ProjectTrackerApp.tokenClient.requestAccessToken({ prompt: 'consent' });
                else ProjectTrackerApp.tokenClient.requestAccessToken({ prompt: '' });
            },
            handleSignoutClick() {
                const token = gapi.client.getToken();
                if (token) {
                    google.accounts.oauth2.revoke(token.access_token);
                    gapi.client.setToken('');
                    localStorage.removeItem('google_auth_token');
                    ProjectTrackerApp.methods.handleSignedOutUser();
                }
            },
            async handleAuthorizedUser() {
                ProjectTrackerApp.elements.body.classList.remove('login-view-active');
                ProjectTrackerApp.elements.mainContainer.style.display = 'flex';
                ProjectTrackerApp.elements.authWrapper.style.display = 'none';
                if (!ProjectTrackerApp.state.isAppInitialized) { await ProjectTrackerApp.methods.loadDataFromSheets(); ProjectTrackerApp.state.isAppInitialized = true; }
            },
            handleSignedOutUser() {
                ProjectTrackerApp.elements.body.classList.add('login-view-active');
                ProjectTrackerApp.elements.authWrapper.style.display = 'block';
                ProjectTrackerApp.elements.mainContainer.style.display = 'none';
                ProjectTrackerApp.state.isAppInitialized = false;
            },

            sheetValuesToObjects(values, headerMap) {
                if (!values || values.length < 2) return [];
                const headers = values[0];
                return values.slice(1).map((row, index) => {
                    let obj = { _row: index + 2 };
                    headers.forEach((header, i) => {
                        const propName = headerMap[header];
                        if (propName) obj[propName] = row[i] || "";
                    });
                    return obj;
                });
            },
            async loadDataFromSheets() {
                ProjectTrackerApp.methods.showLoading("Loading data...");
                try {
                    const response = await gapi.client.sheets.spreadsheets.values.batchGet({ spreadsheetId: ProjectTrackerApp.config.google.SPREADSHEET_ID, ranges: [ProjectTrackerApp.config.sheetNames.PROJECTS, ProjectTrackerApp.config.sheetNames.USERS] });
                    const [projectsData, usersData] = response.result.valueRanges;
                    ProjectTrackerApp.state.projects = ProjectTrackerApp.methods.sheetValuesToObjects(projectsData.values, ProjectTrackerApp.config.HEADER_MAP);
                    ProjectTrackerApp.state.users = ProjectTrackerApp.methods.sheetValuesToObjects(usersData.values, { 'id': 'id', 'name': 'name', 'email': 'email', 'techId': 'techId' });
                    ProjectTrackerApp.methods.refreshAllViews();
                } catch (err) {
                    console.error("Error loading data:", err);
                    alert("Could not load data. Check Spreadsheet ID, sheet names, and sharing permissions.");
                } finally { ProjectTrackerApp.methods.hideLoading(); }
            },
            async updateRowInSheet(sheetName, rowIndex, dataObject) {
                ProjectTrackerApp.methods.showLoading("Saving...");
                try {
                    const headers = (await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: ProjectTrackerApp.config.google.SPREADSHEET_ID, range: `${sheetName}!1:1` })).result.values[0];
                    const invertedHeaderMap = Object.entries(ProjectTrackerApp.config.HEADER_MAP).reduce((acc, [key, value]) => { acc[value] = key; return acc; }, {});
                    const values = [headers.map(header => dataObject[invertedHeaderMap[header]] || dataObject[header] || "")];
                    await gapi.client.sheets.spreadsheets.values.update({ spreadsheetId: ProjectTrackerApp.config.google.SPREADSHEET_ID, range: `${sheetName}!A${rowIndex}`, valueInputOption: 'USER_ENTERED', resource: { values } });
                } catch (err) {
                    console.error(`Error updating row ${rowIndex}:`, err);
                    alert("Failed to save changes.");
                } finally { ProjectTrackerApp.methods.hideLoading(); }
            },

            setupDOMReferences() { ProjectTrackerApp.elements = { body: document.body, authWrapper: document.getElementById('auth-wrapper'), mainContainer: document.querySelector('.dashboard-wrapper'), signInBtn: document.getElementById('signInBtn'), signOutBtn: document.getElementById('signOutBtn'), projectTableBody: document.getElementById('projectTableBody'), loadingOverlay: document.getElementById('loadingOverlay') }; },
            attachEventListeners() {
                ProjectTrackerApp.elements.signInBtn.onclick = ProjectTrackerApp.methods.handleAuthClick;
                ProjectTrackerApp.elements.signOutBtn.onclick = ProjectTrackerApp.methods.handleSignoutClick;
            },
            refreshAllViews() { ProjectTrackerApp.methods.renderProjects(); ProjectTrackerApp.methods.hideLoading(); },
            async handleProjectUpdate(projectId, updates) {
                const project = ProjectTrackerApp.state.projects.find(p => p.id === projectId);
                if (project) {
                    Object.assign(project, updates, { lastModifiedTimestamp: new Date().toISOString() });
                    await ProjectTrackerApp.methods.updateRowInSheet(ProjectTrackerApp.config.sheetNames.PROJECTS, project._row, project);
                    ProjectTrackerApp.methods.renderProjects();
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
                        updates[`startTimeDay${day}`] = ProjectTrackerApp.methods.getCurrentTimeGMT8();
                    } else {
                        updates.status = day < 6 ? `Day${day}Ended_AwaitingNext` : 'Completed';
                        updates[`finishTimeDay${day}`] = ProjectTrackerApp.methods.getCurrentTimeGMT8();
                    }
                } else if (action === 'markDone') updates.status = "Completed";
                await ProjectTrackerApp.methods.handleProjectUpdate(projectId, updates);
            },
            renderProjects() {
                const tableBody = ProjectTrackerApp.elements.projectTableBody;
                tableBody.innerHTML = "";
                ProjectTrackerApp.state.projects.sort((a,b) => (a.baseProjectName+a.areaTask).localeCompare(b.baseProjectName+b.areaTask)).forEach(project => {
                    const row = tableBody.insertRow();
                    ['fixCategory', 'baseProjectName', 'areaTask', 'gsd'].forEach(key => row.insertCell().textContent = project[key]);
                    const assignedToSelect = document.createElement('select');
                    assignedToSelect.innerHTML = '<option value="">Unassigned</option>' + ProjectTrackerApp.state.users.map(u => `<option value="${u.techId}" ${project.assignedTo === u.techId ? 'selected' : ''}>${u.techId}</option>`).join('');
                    assignedToSelect.onchange = (e) => ProjectTrackerApp.methods.handleProjectUpdate(project.id, { 'assignedTo': e.target.value });
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
                        startBtn.onclick = () => ProjectTrackerApp.methods.updateProjectState(project.id, `startDay${i}`);
                        actionsCell.appendChild(startBtn);
                    }
                });
            },
            showLoading(message = "Loading...") { if (ProjectTrackerApp.elements.loadingOverlay) { ProjectTrackerApp.elements.loadingOverlay.querySelector('p').textContent = message; ProjectTrackerApp.elements.loadingOverlay.style.display = 'flex'; } },
            hideLoading() { if (ProjectTrackerApp.elements.loadingOverlay) { ProjectTrackerApp.elements.loadingOverlay.style.display = 'none'; } },
        }
    };
    ProjectTrackerApp.methods.init();
});
