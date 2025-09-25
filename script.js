document.addEventListener('DOMContentLoaded', () => {
    const ProjectTrackerApp = {
        // --- CONFIGURATION ---
        config: {
            google: {
                API_KEY: "AIzaSyBxlhWwf3mlS_6Q3BiUsfpH21AsbhVmDw8",
                SPREADSHEET_ID: "15bhPCYDLChEwO6_uQfvUyq5_qMQp4h816uM26yq3rNY",
            },
            sheetNames: { PROJECTS: "Projects", USERS: "Users" },
            HEADER_MAP: { 'id': 'id', 'Fix Cat': 'fixCategory', 'Project Name': 'baseProjectName', 'Area/Task': 'areaTask', 'GSD': 'gsd', 'Assigned To': 'assignedTo', 'Status': 'status', 'Day 1 Start': 'startTimeDay1', 'Day 1 Finish': 'finishTimeDay1', 'Day 1 Break': 'breakDurationMinutesDay1', 'Day 2 Start': 'startTimeDay2', 'Day 2 Finish': 'finishTimeDay2', 'Day 2 Break': 'breakDurationMinutesDay2', 'Day 3 Start': 'startTimeDay3', 'Day 3 Finish': 'finishTimeDay3', 'Day 3 Break': 'breakDurationMinutesDay3', 'Day 4 Start': 'startTimeDay4', 'Day 4 Finish': 'finishTimeDay4', 'Day 4 Break': 'breakDurationMinutesDay4', 'Day 5 Start': 'startTimeDay5', 'Day 5 Finish': 'finishTimeDay5', 'Day 5 Break': 'breakDurationMinutesDay5', 'Total (min)': 'totalMinutes', 'Last Modified': 'lastModifiedTimestamp', 'Batch ID': 'batchId' },
            FIX_COLORS: {
                "Fix1": { "red": 0.917, "green": 0.964, "blue": 1.0 }, "Fix2": { "red": 0.917, "green": 0.980, "blue": 0.945 },
                "Fix3": { "red": 1.0,   "green": 0.972, "blue": 0.882 }, "Fix4": { "red": 0.984, "green": 0.913, "blue": 0.905 },
                "Fix5": { "red": 0.952, "green": 0.901, "blue": 0.972 },
            }
        },
        state: { 
            projects: [], 
            users: [], 
            currentUser: null,
            isAppInitialized: false,
            filters: {
                month: 'All', project: 'All', fixCategory: 'All',
                showDays: { 1: true, 2: false, 3: false, 4: false, 5: false }
            },
        },
        elements: {},

        // =================================================================================
        // == INITIALIZATION & AUTH (NEW TECH ID SYSTEM) ===================================
        // =================================================================================
        init() {
            this.setupDOMReferences();
            this.attachEventListeners();
            gapi.load('client', this.initializeGapiClient.bind(this));
        },

        async initializeGapiClient() {
            try {
                await gapi.client.init({
                    apiKey: this.config.google.API_KEY,
                    discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
                });
                this.checkSession();
            } catch (error) {
                console.error("GAPI Error: Failed to initialize GAPI client.", error);
                this.elements.loginError.textContent = "Error initializing. Please refresh.";
            }
        },

        checkSession() {
            const userData = sessionStorage.getItem('currentUser');
            if (userData) {
                this.state.currentUser = JSON.parse(userData);
                this.handleAuthorizedUser();
            } else {
                this.handleSignedOutUser();
            }
        },

        async handleTechIdLogin(event) {
            event.preventDefault();
            const techId = this.elements.techIdInput.value.trim().toUpperCase();
            if (!techId) return;

            this.showLoading("Verifying Tech ID...");
            this.elements.loginError.textContent = "";

            try {
                const usersData = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: this.config.google.SPREADSHEET_ID,
                    range: this.config.sheetNames.USERS,
                });

                const users = this.sheetValuesToObjects(usersData.result.values, { 'id': 'id', 'name': 'name', 'email': 'email', 'techId': 'techId' });
                const foundUser = users.find(user => user.techId.toUpperCase() === techId);

                if (foundUser) {
                    this.state.currentUser = foundUser;
                    sessionStorage.setItem('currentUser', JSON.stringify(foundUser));
                    this.handleAuthorizedUser();
                } else {
                    this.elements.loginError.textContent = "Invalid Tech ID. Please try again.";
                    this.hideLoading();
                }
            } catch (err) {
                console.error("Login Error:", err);
                this.elements.loginError.textContent = "Could not verify ID. Check sheet permissions.";
                this.hideLoading();
            }
        },

        handleSignoutClick() {
            sessionStorage.removeItem('currentUser');
            this.state.currentUser = null;
            this.handleSignedOutUser();
        },

        async handleAuthorizedUser() {
            document.body.classList.remove('login-view-active');
            this.elements.authWrapper.style.display = 'none';
            this.elements.dashboardWrapper.style.display = 'flex';
            this.elements.loggedInUser.textContent = `Welcome, ${this.state.currentUser.name}`;

            if (!this.state.isAppInitialized) {
                await this.loadDataFromSheets();
                this.state.isAppInitialized = true;
            } else {
                this.filterAndRenderProjects(); 
            }
        },

        handleSignedOutUser() {
            this.hideLoading();
            document.body.classList.add('login-view-active');
            this.elements.authWrapper.style.display = 'block';
            this.elements.dashboardWrapper.style.display = 'none';
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
                headers.forEach((header, i) => { const propName = headerMap[header.trim()]; if (propName) obj[propName] = row[i] || ""; });
                return obj;
            });
        },
        async loadDataFromSheets() {
            this.showLoading("Loading data from Google Sheets...");
            try {
                const spreadsheet = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: this.config.google.SPREADSHEET_ID, });
                const projectSheet = spreadsheet.result.sheets.find(s => s.properties.title === this.config.sheetNames.PROJECTS);
                if (!projectSheet) throw new Error(`Sheet "${this.config.sheetNames.PROJECTS}" not found.`);
                this.state.projectSheetId = projectSheet.properties.sheetId;

                const response = await gapi.client.sheets.spreadsheets.values.batchGet({
                    spreadsheetId: this.config.google.SPREADSHEET_ID,
                    ranges: [this.config.sheetNames.PROJECTS, this.config.sheetNames.USERS],
                });
                const valueRanges = response.result.valueRanges;
                const projectsData = valueRanges.find(range => range.range.startsWith(this.config.sheetNames.PROJECTS));
                const usersData = valueRanges.find(range => range.range.startsWith(this.config.sheetNames.USERS));
                let loadedProjects = (projectsData && projectsData.values) ? this.sheetValuesToObjects(projectsData.values, this.config.HEADER_MAP) : [];
                this.state.projects = loadedProjects.filter(p => p.baseProjectName && p.baseProjectName.trim() !== "");
                this.state.users = (usersData && usersData.values) ? this.sheetValuesToObjects(usersData.values, { 'id': 'id', 'name': 'name', 'email': 'email', 'techId': 'techId' }) : [];
                this.populateFilterDropdowns();
                this.filterAndRenderProjects();
            } catch (err) {
                console.error("Data Error:", err);
                alert("Could not load data. Check Spreadsheet ID and that it is shared so 'Anyone with the link can view'.");
            } finally {
                this.hideLoading();
            }
        },
        async updateRowInSheet(sheetName, rowIndex, dataObject) {
            this.showLoading("Saving...");
            try {
                const getHeaders = await gapi.client.sheets.spreadsheets.values.get({
                     spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${sheetName}!1:1`,
                });
                const headers = getHeaders.result.values[0];
                const values = [headers.map(header => {
                    const propName = this.config.HEADER_MAP[header.trim()];
                    return dataObject[propName] !== undefined ? dataObject[propName] : "";
                })];
                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${sheetName}!A${rowIndex}`,
                    valueInputOption: 'USER_ENTERED', resource: { values: values }
                });
            } catch (err) {
                console.error(`Data Error: Failed to update row ${rowIndex}.`, err);
                alert("Failed to save changes. The data will be refreshed to prevent inconsistencies.");
                await this.loadDataFromSheets();
            } finally { this.hideLoading(); }
        },
        async appendRowsToSheet(sheetName, rows) {
            try {
                await gapi.client.sheets.spreadsheets.values.append({
                    spreadsheetId: this.config.google.SPREADSHEET_ID, range: sheetName,
                    valueInputOption: 'USER_ENTERED', resource: { values: rows }
                });
            } catch (err) {
                console.error("Data Error: Failed to append rows to sheet.", err);
                throw new Error("Failed to add data to Google Sheet.");
            }
        },
        async deleteSheetRows(rowsToDelete) {
            this.showLoading("Deleting rows...");
            try {
                if (rowsToDelete.length === 0) return;
                const sortedRows = rowsToDelete.sort((a, b) => b - a);
                const requests = sortedRows.map(rowIndex => ({
                    deleteDimension: {
                        range: { sheetId: this.state.projectSheetId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex, },
                    },
                }));
                await gapi.client.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.config.google.SPREADSHEET_ID, resource: { requests },
                });
            } catch (err) {
                console.error("API Error: Failed to delete rows.", err);
                throw new Error("Could not delete rows from the sheet.");
            } finally { this.hideLoading(); }
        },
        
        // =================================================================================
        // == UI AND EVENT LOGIC ===========================================================
        // =================================================================================
        setupDOMReferences() {
            this.elements = {
                body: document.body, authWrapper: document.getElementById('auth-wrapper'),
                dashboardWrapper: document.querySelector('.dashboard-wrapper'), 
                loginForm: document.getElementById('loginForm'), techIdInput: document.getElementById('techIdInput'),
                loginError: document.getElementById('loginError'), loggedInUser: document.getElementById('loggedInUser'),
                signOutBtn: document.getElementById('signOutBtn'), projectTable: document.getElementById('projectTable'),
                projectTableHead: document.getElementById('projectTable').querySelector('thead tr'), projectTableBody: document.getElementById('projectTableBody'),
                loadingOverlay: document.getElementById('loadingOverlay'), openNewProjectModalBtn: document.getElementById('openNewProjectModalBtn'),
                projectFormModal: document.getElementById('projectFormModal'), closeProjectFormBtn: document.getElementById('closeProjectFormBtn'),
                newProjectForm: document.getElementById('newProjectForm'), monthFilter: document.getElementById('monthFilter'),
                projectFilter: document.getElementById('projectFilter'), fixCategoryFilter: document.getElementById('fixCategoryFilter'),
                dayCheckboxes: { 2: document.getElementById('showDay2'), 3: document.getElementById('showDay3'), 4: document.getElementById('showDay4'), 5: document.getElementById('showDay5'),},
                filterLoadingSpinner: document.getElementById('filterLoadingSpinner'), openTechDashboardBtn: document.getElementById('openTechDashboardBtn'),
                openProjectSettingsBtn: document.getElementById('openProjectSettingsBtn'), techDashboardContainer: document.getElementById('techDashboardContainer'),
                projectSettingsView: document.getElementById('projectSettingsView'), 
                openTlSummaryBtn: document.getElementById('openTlSummaryBtn'), tlSummaryView: document.getElementById('tlSummaryView'),
                summaryTableBody: document.getElementById('summaryTableBody'),
                openUserManagementBtn: document.getElementById('openUserManagementBtn'),
                userManagementView: document.getElementById('userManagementView'),
                userTableBody: document.getElementById('userTableBody'),
            };
        },

        attachEventListeners() {
            this.elements.loginForm.addEventListener('submit', this.handleTechIdLogin.bind(this));
            this.elements.signOutBtn.onclick = () => this.handleSignoutClick();
            this.elements.openNewProjectModalBtn.onclick = () => this.elements.projectFormModal.style.display = 'block';
            this.elements.closeProjectFormBtn.onclick = () => this.elements.projectFormModal.style.display = 'none';
            this.elements.newProjectForm.addEventListener('submit', (e) => this.handleAddProjectSubmit(e));
            this.elements.openTechDashboardBtn.onclick = () => this.switchView('dashboard');
            this.elements.openProjectSettingsBtn.onclick = () => this.switchView('settings');
            this.elements.openTlSummaryBtn.onclick = () => this.switchView('summary');
            this.elements.openUserManagementBtn.onclick = () => this.switchView('users');
            this.elements.projectFilter.addEventListener('change', (e) => {
                this.state.filters.project = e.target.value; this.filterAndRenderProjects();
            });
            this.elements.fixCategoryFilter.addEventListener('change', (e) => {
                this.state.filters.fixCategory = e.target.value; this.filterAndRenderProjects();
            });
            for (let i = 2; i <= 5; i++) {
                this.elements.dayCheckboxes[i].addEventListener('change', (e) => {
                    this.state.filters.showDays[i] = e.target.checked;
                    this.filterAndRenderProjects();
                });
            }
        },

        switchView(viewName) {
            this.elements.techDashboardContainer.style.display = 'none';
            this.elements.projectSettingsView.style.display = 'none';
            this.elements.tlSummaryView.style.display = 'none';
            this.elements.userManagementView.style.display = 'none';
            this.elements.openTechDashboardBtn.classList.remove('active');
            this.elements.openProjectSettingsBtn.classList.remove('active');
            this.elements.openTlSummaryBtn.classList.remove('active');
            this.elements.openUserManagementBtn.classList.remove('active');

            if (viewName === 'dashboard') {
                this.elements.techDashboardContainer.style.display = 'block'; this.elements.openTechDashboardBtn.classList.add('active');
            } else if (viewName === 'settings') {
                this.renderProjectSettings(); this.elements.projectSettingsView.style.display = 'flex'; this.elements.openProjectSettingsBtn.classList.add('active');
            } else if (viewName === 'summary') {
                this.renderTlSummary(); this.elements.tlSummaryView.style.display = 'flex'; this.elements.openTlSummaryBtn.classList.add('active');
            } else if (viewName === 'users') {
                this.renderUserManagement(); this.elements.userManagementView.style.display = 'flex'; this.elements.openUserManagementBtn.classList.add('active');
            }
        },
        
        // --- ALL FUNCTIONS BELOW THIS POINT ARE UNCHANGED FROM THE PREVIOUS VERSION ---
        populateFilterDropdowns() {
            const projects = [...new Set(this.state.projects.map(p => p.baseProjectName).filter(Boolean))].sort();
            this.elements.projectFilter.innerHTML = '<option value="All">All Projects</option>' + projects.map(p => `<option value="${p}">${this.formatProjectName(p)}</option>`).join('');
            this.elements.projectFilter.value = this.state.filters.project;

            const fixCategories = [...new Set(this.state.projects.map(p => p.fixCategory).filter(Boolean))].sort();
            this.elements.fixCategoryFilter.innerHTML = '<option value="All">All</option>' + fixCategories.map(c => `<option value="${c}">${c}</option>`).join('');
            this.elements.fixCategoryFilter.value = this.state.filters.fixCategory;
        },
        async handleAddProjectSubmit(event) {
            event.preventDefault(); this.showLoading("Adding project(s)...");
            const numRows = parseInt(document.getElementById('numRows').value, 10);
            const baseProjectName = document.getElementById('baseProjectName').value.trim();
            const gsd = document.getElementById('gsd').value; const batchId = `batch_${Date.now()}`;
            try {
                const getHeaders = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${this.config.sheetNames.PROJECTS}!1:1`, });
                const headers = getHeaders.result.values[0]; const newRows = [];
                for (let i = 1; i <= numRows; i++) {
                    const newRowObj = {
                        id: `proj_${Date.now()}_${i}`, batchId, baseProjectName,
                        areaTask: `Area${String(i).padStart(2, '0')}`, gsd, fixCategory: "Fix1", status: "Available",
                        lastModifiedTimestamp: new Date().toISOString()
                    };
                    const row = headers.map(header => newRowObj[this.config.HEADER_MAP[header.trim()]] || ""); newRows.push(row);
                }
                await this.appendRowsToSheet(this.config.sheetNames.PROJECTS, newRows);
                this.elements.projectFormModal.style.display = 'none'; this.elements.newProjectForm.reset(); await this.loadDataFromSheets();
            } catch (error) {
                alert("Error adding projects: " + error.message);
            } finally { this.hideLoading(); }
        },
        calculateTotalMinutes(project) {
            let totalWorkMinutes = 0; let totalBreakMinutes = 0;
            for (let i = 1; i <= 5; i++) {
                const startTime = project[`startTimeDay${i}`] || ''; const finishTime = project[`finishTimeDay${i}`] || '';
                const breakMins = parseInt(project[`breakDurationMinutesDay${i}`] || '0', 10);
                if (startTime && finishTime) totalWorkMinutes += this.parseTimeToMinutes(finishTime) - this.parseTimeToMinutes(startTime);
                totalBreakMinutes += breakMins;
            }
            const totalNetMinutes = totalWorkMinutes - totalBreakMinutes;
            return totalNetMinutes > 0 ? totalNetMinutes : '';
        },
        async handleProjectUpdate(projectId, updates) {
            const project = this.state.projects.find(p => p.id === projectId);
            if (project) {
                const tempUpdatedProject = { ...project, ...updates };
                updates.totalMinutes = this.calculateTotalMinutes(tempUpdatedProject);
                Object.assign(project, updates, { lastModifiedTimestamp: new Date().toISOString() });
                this.filterAndRenderProjects();
                await this.updateRowInSheet(this.config.sheetNames.PROJECTS, project._row, project);
            }
        },
        getCurrentTime() { return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); },
        async updateProjectState(projectId, action) {
            const project = this.state.projects.find(p => p.id === projectId);
            if (!project) return; const updates = {};
            const dayMatch = action.match(/(start|end)Day(\d)/);
            if (dayMatch) {
                const [, type, day] = dayMatch; const dayNum = parseInt(day, 10);
                updates.status = type === 'start' ? `InProgressDay${dayNum}` : (dayNum < 5 ? `Day${dayNum}Ended_AwaitingNext` : 'Completed');
                if (type === 'start') updates[`startTimeDay${dayNum}`] = this.getCurrentTime();
                if (type === 'end') updates[`finishTimeDay${dayNum}`] = this.getCurrentTime();
            }
            await this.handleProjectUpdate(projectId, updates);
        },
        parseTimeToMinutes(timeStr) {
            if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return 0;
            const [hours, minutes] = timeStr.split(':').map(Number);
            return (hours * 60) + minutes;
        },
        formatProjectName(name) {
            if (!name) return '';
            return name.replace(/__/g, '  ').replace(/_/g, ' ');
        },
        async handleReleaseFix(baseProjectName, fromFix, toFix) { /* Unchanged */ },
        async handleAddExtraArea(baseProjectName) { /* Unchanged */ },
        async handleRollback(baseProjectName, fixToDelete) { /* Unchanged */ },
        async handleDeleteProject(baseProjectName) { /* Unchanged */ },
        async handleReorganizeSheet() { /* Unchanged */ },
        renderProjectSettings() { /* Unchanged */ },
        renderTlSummary() { /* Unchanged */ },
        filterAndRenderProjects() { /* Unchanged */ },
        renderProjects(projectsToRender = this.state.projects) { /* Unchanged */ },
        renderUserManagement() { /* Unchanged */ },
        showLoading(message = "Loading...") {
            if (this.elements.loadingOverlay) { this.elements.loadingOverlay.querySelector('p').textContent = message; this.elements.loadingOverlay.style.display = 'flex'; }
        },
        hideLoading() { if (this.elements.loadingOverlay) { this.elements.loadingOverlay.style.display = 'none'; } },
        showFilterSpinner() { if (this.elements.filterLoadingSpinner) { this.elements.filterLoadingSpinner.style.display = 'block'; } },
        hideFilterSpinner() { if (this.elements.filterLoadingSpinner) { this.elements.filterLoadingSpinner.style.display = 'none'; } }
    };

    ProjectTrackerApp.init();
});
