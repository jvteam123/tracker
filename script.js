document.addEventListener('DOMContentLoaded', () => {
    const ProjectTrackerApp = {
        config: {
            google: {
                API_KEY: "AIzaSyBxlhWwf3mlS_6Q3BiUsfpH21AsbhVmDw8",
                CLIENT_ID: "221107133299-7r4vnbhpsdrnqo8tss0dqbtrr9ou683e.apps.googleusercontent.com",
                SPREADSHEET_ID: "15bhPCYDLChEwO6_uQfvUyq5_qMQp4h816uM26yq3rNY",
                SCOPES: "https://www.googleapis.com/auth/spreadsheets",
            },
            sheetNames: { PROJECTS: "Projects", USERS: "Users" },
            HEADER_MAP: { 'id': 'id', 'Fix Cat': 'fixCategory', 'Project Name': 'baseProjectName', 'Area/Task': 'areaTask', 'GSD': 'gsd', 'Assigned To': 'assignedTo', 'Status': 'status', 'Day 1 Start': 'startTimeDay1', 'Day 1 Finish': 'finishTimeDay1', 'Day 1 Break': 'breakDurationMinutesDay1', 'Day 2 Start': 'startTimeDay2', 'Day 2 Finish': 'finishTimeDay2', 'Day 2 Break': 'breakDurationMinutesDay2', 'Day 3 Start': 'startTimeDay3', 'Day 3 Finish': 'finishTimeDay3', 'Day 3 Break': 'breakDurationMinutesDay3', 'Day 4 Start': 'startTimeDay4', 'Day 4 Finish': 'finishTimeDay4', 'Day 4 Break': 'breakDurationMinutesDay4', 'Day 5 Start': 'startTimeDay5', 'Day 5 Finish': 'finishTimeDay5', 'Day 5 Break': 'breakDurationMinutesDay5', 'Total (min)': 'totalMinutes', 'Last Modified': 'lastModifiedTimestamp', 'Batch ID': 'batchId' },
            FIX_COLORS: {
                "Fix1": { "red": 0.917, "green": 0.964, "blue": 1.0 }, "Fix2": { "red": 0.917, "green": 0.980, "blue": 0.945 },
                "Fix3": { "red": 1.0,   "green": 0.972, "blue": 0.882 }, "Fix4": { "red": 0.984, "green": 0.913, "blue": 0.905 },
                "Fix5": { "red": 0.952, "green": 0.901, "blue": 0.972 },
            }
        },
        tokenClient: null,
        state: {
            projects: [],
            users: [],
            isAppInitialized: false,
            filters: {
                project: 'All',
                fixCategory: 'All',
                showDays: { 1: true, 2: false, 3: false, 4: false, 5: false }
            },
        },
        elements: {},

        // =================================================================================
        // == INITIALIZATION & AUTH ========================================================
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
                this.initializeGsi();
            } catch (error) {
                console.error("GAPI Error: Failed to initialize GAPI client.", error);
                this.handleSignedOutUser();
            }
        },
        initializeGsi() {
            this.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: this.config.google.CLIENT_ID,
                scope: this.config.google.SCOPES,
                callback: this.handleTokenResponse.bind(this),
            });
            this.tokenClient.requestAccessToken({ prompt: 'none' });
        },
        handleAuthClick() {
            this.showLoading("Signing in...");
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        },
        async handleTokenResponse(resp) {
            if (resp && resp.access_token) {
                gapi.client.setToken(resp);
                this.handleAuthorizedUser();
            } else {
                console.log("Silent sign-in failed. Awaiting manual login.");
                this.handleSignedOutUser();
            }
        },
        handleSignoutClick() {
            const token = gapi.client.getToken();
            if (token) {
                google.accounts.oauth2.revoke(token.access_token, () => {
                    this.handleSignedOutUser();
                });
            } else {
                this.handleSignedOutUser();
            }
        },
        async handleAuthorizedUser() {
            document.body.classList.remove('login-view-active');
            this.elements.authWrapper.style.display = 'none';
            this.elements.dashboardWrapper.style.display = 'flex';
            this.elements.loggedInUser.textContent = `Signed In`;
            if (!this.state.isAppInitialized) {
                await this.loadDataFromSheets();
                this.state.isAppInitialized = true;
            } else {
                this.filterAndRenderProjects();
            }
        },
        handleSignedOutUser() {
            gapi.client.setToken(null);
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
                if (err.status === 401 || err.status === 403) {
                     alert("Authentication error. You may need to sign in again.");
                     this.handleSignoutClick();
                } else {
                    alert("Could not load data. Check Spreadsheet ID and sharing permissions.");
                }
            } finally {
                this.hideLoading();
            }
        },
        async updateRowInSheet(sheetName, rowIndex, dataObject) {
            this.showLoading("Saving...");
            try {
                const headersResult = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: this.config.google.SPREADSHEET_ID,
                    range: `${sheetName}!1:1`,
                });
                const headers = headersResult.result.values[0];
                const headerMap = sheetName === this.config.sheetNames.USERS
                    ? { 'id': 'id', 'name': 'name', 'email': 'email', 'techid': 'techId' }
                    : this.config.HEADER_MAP;

                const values = [headers.map(header => {
                    const propName = headerMap[header.trim()] || headerMap[header.trim().toLowerCase()];
                    return dataObject[propName] !== undefined ? dataObject[propName] : "";
                })];

                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: this.config.google.SPREADSHEET_ID,
                    range: `${sheetName}!A${rowIndex}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: values }
                });
            } catch (err) {
                console.error(`Data Error: Failed to update row ${rowIndex} in ${sheetName}.`, err);
                alert("Failed to save changes. The data will be refreshed to prevent inconsistencies.");
                await this.loadDataFromSheets();
            } finally {
                this.hideLoading();
            }
        },
        async appendRowsToSheet(sheetName, rows) {
            try {
                await gapi.client.sheets.spreadsheets.values.append({
                    spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${sheetName}!A1`,
                    valueInputOption: 'USER_ENTERED', resource: { values: rows }
                });
            } catch (err) {
                console.error("Data Error: Failed to append rows to sheet.", err);
                throw new Error("Failed to add data to Google Sheet.");
            }
        },
        async deleteSheetRows(sheetName, rowsToDelete) {
            this.showLoading("Deleting rows...");
            try {
                if (rowsToDelete.length === 0) return;

                const spreadsheet = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: this.config.google.SPREADSHEET_ID });
                const sheet = spreadsheet.result.sheets.find(s => s.properties.title === sheetName);
                if (!sheet) throw new Error(`Sheet "${sheetName}" not found.`);
                const sheetId = sheet.properties.sheetId;

                const sortedRows = rowsToDelete.sort((a, b) => b - a);
                const requests = sortedRows.map(rowIndex => ({
                    deleteDimension: {
                        range: { sheetId: sheetId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex, },
                    },
                }));
                await gapi.client.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.config.google.SPREADSHEET_ID, resource: { requests },
                });
            } catch (err) {
                console.error("API Error: Failed to delete rows.", err);
                throw new Error("Could not delete rows from the sheet.");
            } finally {
                this.hideLoading();
            }
        },

        // =================================================================================
        // == UI AND EVENT LOGIC ===========================================================
        // =================================================================================
        setupDOMReferences() {
            this.elements = {
                body: document.body, authWrapper: document.getElementById('auth-wrapper'),
                dashboardWrapper: document.querySelector('.dashboard-wrapper'), signInBtn: document.getElementById('signInBtn'),
                loggedInUser: document.getElementById('loggedInUser'), signOutBtn: document.getElementById('signOutBtn'),
                projectTable: document.getElementById('projectTable'),
                projectTableHead: document.getElementById('projectTable').querySelector('thead tr'), projectTableBody: document.getElementById('projectTableBody'),
                loadingOverlay: document.getElementById('loadingOverlay'), openNewProjectModalBtn: document.getElementById('openNewProjectModalBtn'),
                projectFormModal: document.getElementById('projectFormModal'), closeProjectFormBtn: document.getElementById('closeProjectFormBtn'),
                newProjectForm: document.getElementById('newProjectForm'),
                userFormModal: document.getElementById('userFormModal'), closeUserFormBtn: document.getElementById('closeUserFormBtn'),
                userForm: document.getElementById('userForm'), userFormTitle: document.getElementById('userFormTitle'),
                userId: document.getElementById('userId'), userRow: document.getElementById('userRow'),
                userName: document.getElementById('userName'), userEmail: document.getElementById('userEmail'), userTechId: document.getElementById('userTechId'),
                projectFilter: document.getElementById('projectFilter'),
                fixCategoryFilter: document.getElementById('fixCategoryFilter'),
                dayCheckboxes: { 2: document.getElementById('showDay2'), 3: document.getElementById('showDay3'), 4: document.getElementById('showDay4'), 5: document.getElementById('showDay5'),},
                openTechDashboardBtn: document.getElementById('openTechDashboardBtn'),
                openProjectSettingsBtn: document.getElementById('openProjectSettingsBtn'), techDashboardContainer: document.getElementById('techDashboardContainer'),
                projectSettingsView: document.getElementById('projectSettingsView'),
                openTlSummaryBtn: document.getElementById('openTlSummaryBtn'), tlSummaryView: document.getElementById('tlSummaryView'),
                summaryTableBody: document.getElementById('summaryTableBody'),
                openUserManagementBtn: document.getElementById('openUserManagementBtn'), userManagementView: document.getElementById('userManagementView'),
                userTableBody: document.getElementById('userTableBody'), addUserBtn: document.getElementById('addUserBtn'),
                openAdminSettingsBtn: document.getElementById('openAdminSettingsBtn'), adminSettingsView: document.getElementById('adminSettingsView'),
                timeEditModal: document.getElementById('timeEditModal'), closeTimeEditModalBtn: document.getElementById('closeTimeEditModalBtn'),
                timeEditForm: document.getElementById('timeEditForm'), timeEditTitle: document.getElementById('timeEditTitle'),
                timeEditProjectId: document.getElementById('timeEditProjectId'), timeEditDay: document.getElementById('timeEditDay'),
                editStartTime: document.getElementById('editStartTime'), editFinishTime: document.getElementById('editFinishTime'),
            };
        },
        attachEventListeners() {
            this.elements.signInBtn.onclick = () => this.handleAuthClick();
            this.elements.signOutBtn.onclick = () => this.handleSignoutClick();
            this.elements.openNewProjectModalBtn.onclick = () => this.elements.projectFormModal.style.display = 'block';
            this.elements.closeProjectFormBtn.onclick = () => this.elements.projectFormModal.style.display = 'none';
            this.elements.newProjectForm.addEventListener('submit', (e) => this.handleAddProjectSubmit(e));

            this.elements.addUserBtn.onclick = () => this.openUserModal();
            this.elements.closeUserFormBtn.onclick = () => this.elements.userFormModal.style.display = 'none';
            this.elements.userForm.addEventListener('submit', (e) => this.handleUserFormSubmit(e));

            this.elements.closeTimeEditModalBtn.onclick = () => this.elements.timeEditModal.style.display = 'none';
            this.elements.timeEditForm.addEventListener('submit', (e) => this.handleTimeEditSubmit(e));

            this.elements.openTechDashboardBtn.onclick = () => this.switchView('dashboard');
            this.elements.openProjectSettingsBtn.onclick = () => this.switchView('settings');
            this.elements.openTlSummaryBtn.onclick = () => this.switchView('summary');
            this.elements.openUserManagementBtn.onclick = () => this.switchView('users');
            this.elements.openAdminSettingsBtn.onclick = () => this.switchView('admin');
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
            this.elements.adminSettingsView.style.display = 'none';
            this.elements.openTechDashboardBtn.classList.remove('active');
            this.elements.openProjectSettingsBtn.classList.remove('active');
            this.elements.openTlSummaryBtn.classList.remove('active');
            this.elements.openUserManagementBtn.classList.remove('active');
            this.elements.openAdminSettingsBtn.classList.remove('active');

            if (viewName === 'dashboard') {
                this.elements.techDashboardContainer.style.display = 'flex'; this.elements.openTechDashboardBtn.classList.add('active');
            } else if (viewName === 'settings') {
                this.renderProjectSettings(); this.elements.projectSettingsView.style.display = 'block'; this.elements.openProjectSettingsBtn.classList.add('active');
            } else if (viewName === 'summary') {
                this.renderTlSummary(); this.elements.tlSummaryView.style.display = 'block'; this.elements.openTlSummaryBtn.classList.add('active');
            } else if (viewName === 'users') {
                this.renderUserManagement(); this.elements.userManagementView.style.display = 'block'; this.elements.openUserManagementBtn.classList.add('active');
            } else if (viewName === 'admin') {
                this.renderAdminSettings(); this.elements.adminSettingsView.style.display = 'block'; this.elements.openAdminSettingsBtn.classList.add('active');
            }
        },
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
                this.elements.projectFormModal.style.display = 'none'; this.elements.newProjectForm.reset();
                await this.loadDataFromSheets();
                await this.handleReorganizeSheet(true); // Auto-reorganize
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
                updates.status = type === 'start' ? `InProgressDay${dayNum}` : 'Started Available';
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
        async handleReleaseFix(baseProjectName, fromFix, toFix) {
            if (!confirm(`This will create new '${toFix}' tasks for all '${fromFix}' areas in project '${this.formatProjectName(baseProjectName)}'. The original tech will be assigned. Continue?`)) return;
            this.showLoading(`Releasing ${fromFix} to ${toFix}...`);
            try {
                const tasksToClone = this.state.projects.filter(p => p.baseProjectName === baseProjectName && p.fixCategory === fromFix);
                if (tasksToClone.length === 0) throw new Error(`No tasks found for ${baseProjectName} in ${fromFix}.`);
                
                const batchId = `batch_release_${Date.now()}`;
                tasksToClone.forEach((task, index) => {
                    const newRowObj = { ...task,
                        id: `proj_${Date.now()}_${index}`,
                        batchId,
                        fixCategory: toFix,
                        status: "Available",
                        startTimeDay1: "", finishTimeDay1: "", breakDurationMinutesDay1: "",
                        startTimeDay2: "", finishTimeDay2: "", breakDurationMinutesDay2: "",
                        startTimeDay3: "", finishTimeDay3: "", breakDurationMinutesDay3: "",
                        startTimeDay4: "", finishTimeDay4: "", breakDurationMinutesDay4: "",
                        startTimeDay5: "", finishTimeDay5: "", breakDurationMinutesDay5: "",
                        totalMinutes: "",
                        lastModifiedTimestamp: new Date().toISOString()
                    };
                    delete newRowObj._row; // Remove the old row number
                    this.state.projects.push(newRowObj); // Add new project object to the state in memory
                });

                await this.handleReorganizeSheet(true);
                
                alert(`${fromFix} released to ${toFix} successfully!`);
            } catch (error) {
                alert("Error releasing fix: " + error.message);
                await this.loadDataFromSheets(); // Reload data on error to be safe
            } finally {
                this.hideLoading();
            }
        },
        async handleAddExtraArea(baseProjectName) {
            const numToAdd = parseInt(prompt("How many extra areas do you want to add?", "1"), 10);
            if (isNaN(numToAdd) || numToAdd < 1) return; this.showLoading(`Adding ${numToAdd} area(s)...`);
            try {
                const projectTasks = this.state.projects.filter(p => p.baseProjectName === baseProjectName);
                if (projectTasks.length === 0) throw new Error(`Could not find project: ${baseProjectName}`);
                const latestTask = projectTasks.sort((a, b) => a.areaTask.localeCompare(b.areaTask)).pop();
                const lastAreaNumber = parseInt((latestTask.areaTask.match(/\d+$/) || ['0'])[0], 10);
                const getHeaders = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${this.config.sheetNames.PROJECTS}!1:1`, });
                const headers = getHeaders.result.values[0]; const newRows = []; const batchId = `batch_extra_${Date.now()}`;
                for (let i = 1; i <= numToAdd; i++) {
                    const newAreaNumber = lastAreaNumber + i;
                    const newRowObj = { ...latestTask, id: `proj_${Date.now()}_${i}`, batchId, areaTask: `Area${String(newAreaNumber).padStart(2, '0')}`, status: "Available",
                        startTimeDay1: "", finishTimeDay1: "", breakDurationMinutesDay1: "", startTimeDay2: "", finishTimeDay2: "", breakDurationMinutesDay2: "",
                        startTimeDay3: "", finishTimeDay3: "", breakDurationMinutesDay3: "", startTimeDay4: "", finishTimeDay4: "", breakDurationMinutesDay4: "",
                        startTimeDay5: "", finishTimeDay5: "", breakDurationMinutesDay5: "", totalMinutes: "", lastModifiedTimestamp: new Date().toISOString()
                    };
                     delete newRowObj._row;
                    const row = headers.map(header => newRowObj[this.config.HEADER_MAP[header.trim()]] || ""); newRows.push(row);
                }
                await this.appendRowsToSheet(this.config.sheetNames.PROJECTS, newRows); await this.loadDataFromSheets();
                alert(`${numToAdd} area(s) added successfully!`);
            } catch (error) {
                alert("Error adding extra areas: " + error.message);
            } finally { this.hideLoading(); }
        },
        async handleRollback(baseProjectName, fixToDelete) {
            if (!confirm(`DANGER: This will permanently delete all '${fixToDelete}' tasks for project '${this.formatProjectName(baseProjectName)}'. This cannot be undone. Continue?`)) return;
            try {
                const tasksToDelete = this.state.projects.filter(p => p.baseProjectName === baseProjectName && p.fixCategory === fixToDelete);
                if (tasksToDelete.length === 0) throw new Error(`No tasks found to delete for ${fixToDelete}.`);
                const rowNumbersToDelete = tasksToDelete.map(p => p._row);
                await this.deleteSheetRows(this.config.sheetNames.PROJECTS, rowNumbersToDelete); await this.loadDataFromSheets();
                alert(`${fixToDelete} tasks have been deleted successfully.`);
            } catch(error) {
                alert("Error rolling back project: " + error.message);
            }
        },
        async handleDeleteProject(baseProjectName) {
            if (!confirm(`EXTREME DANGER: This will permanently delete the ENTIRE project '${this.formatProjectName(baseProjectName)}', including all of its fix stages. This cannot be undone. Are you absolutely sure?`)) return;
            try {
                const tasksToDelete = this.state.projects.filter(p => p.baseProjectName === baseProjectName);
                if (tasksToDelete.length === 0) throw new Error(`No tasks found for project ${baseProjectName}.`);
                const rowNumbersToDelete = tasksToDelete.map(p => p._row);
                await this.deleteSheetRows(this.config.sheetNames.PROJECTS, rowNumbersToDelete);
                this.state.filters.project = 'All';
                await this.loadDataFromSheets();
                this.renderProjectSettings(); // Refresh the view
                alert(`Project '${this.formatProjectName(baseProjectName)}' has been deleted successfully.`);
            } catch(error) {
                alert("Error deleting project: " + error.message);
            }
        },
        async handleReorganizeSheet(isSilent = false) {
            if (!isSilent) {
                if (!confirm("This will reorganize the entire 'Projects' sheet by Project Name and Fix Stage, inserting blank rows and applying colors. This action cannot be undone. Are you sure?")) return;
            }
            this.showLoading("Reorganizing sheet...");
            try {
                const getHeaders = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${this.config.sheetNames.PROJECTS}!1:1`, });
                const headers = getHeaders.result.values[0];
                const sortedProjects = [...this.state.projects].sort((a, b) => {
                    if (a.baseProjectName < b.baseProjectName) return -1;
                    if (a.baseProjectName > b.baseProjectName) return 1;
                    const fixNumA = parseInt(a.fixCategory.replace('Fix', ''), 10);
                    const fixNumB = parseInt(b.fixCategory.replace('Fix', ''), 10);
                    if (fixNumA < fixNumB) return -1;
                    if (fixNumA > fixNumB) return 1;
                    if (a.areaTask < b.areaTask) return -1;
                    if (a.areaTask > b.areaTask) return 1;
                    return 0;
                });
                const newSheetData = [];
                const formattingRequests = [];
                let lastProject = null;
                let lastFix = null;
                let currentRowIndex = 1;
                sortedProjects.forEach(project => {
                    currentRowIndex++;
                    if ( (lastProject !== null && project.baseProjectName !== lastProject) || (lastFix !== null && project.fixCategory !== lastFix) ) {
                         newSheetData.push(new Array(headers.length).fill(""));
                         currentRowIndex++;
                    }
                    const row = headers.map(header => project[this.config.HEADER_MAP[header.trim()]] || "");
                    newSheetData.push(row);
                    const color = this.config.FIX_COLORS[project.fixCategory];
                    if (color) {
                        formattingRequests.push({
                            repeatCell: {
                                range: { sheetId: this.state.projectSheetId, startRowIndex: currentRowIndex -1, endRowIndex: currentRowIndex },
                                cell: { userEnteredFormat: { backgroundColor: color } },
                                fields: "userEnteredFormat.backgroundColor"
                            }
                        });
                    }
                    lastProject = project.baseProjectName;
                    lastFix = project.fixCategory;
                });
                await gapi.client.sheets.spreadsheets.values.clear({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${this.config.sheetNames.PROJECTS}!A2:Z`, });
                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${this.config.sheetNames.PROJECTS}!A2`,
                    valueInputOption: 'USER_ENTERED', resource: { values: newSheetData }
                });
                if (formattingRequests.length > 0) {
                    await gapi.client.sheets.spreadsheets.batchUpdate({ spreadsheetId: this.config.google.SPREADSHEET_ID, resource: { requests: formattingRequests } });
                }
                
                if (!isSilent) {
                    await this.loadDataFromSheets();
                    alert("Sheet reorganized and colored successfully!");
                } else {
                    await this.loadDataFromSheets();
                }
            } catch(error) {
                console.error("Reorganization Error:", error);
                alert("Error reorganizing sheet: " + error.message);
            } finally {
                this.hideLoading();
            }
        },
        renderProjectSettings() {
            const container = this.elements.projectSettingsView; container.innerHTML = "";
            const uniqueProjects = [...new Set(this.state.projects.map(p => p.baseProjectName))].sort();
            if (uniqueProjects.length === 0) {
                container.insertAdjacentHTML('beforeend', `<p>No projects found to configure.</p>`);
                return;
            }
            uniqueProjects.forEach(projectName => {
                if (!projectName) return;
                const projectTasks = this.state.projects.filter(p => p.baseProjectName === projectName);
                const fixCategories = [...new Set(projectTasks.map(p => p.fixCategory))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                const currentFix = fixCategories.length > 0 ? fixCategories[fixCategories.length - 1] : 'Fix1';
                const currentFixNum = parseInt(currentFix.replace('Fix', ''), 10);
                const nextFix = `Fix${currentFixNum + 1}`; const canRollback = fixCategories.length > 1;
                const cardHTML = `
                    <div class="project-settings-card">
                        <h2>${this.formatProjectName(projectName)}</h2>
                        <div class="settings-grid">
                            <div class="settings-card">
                                <h3><i class="fas fa-rocket icon"></i> Release Tasks</h3>
                                <div class="btn-group">
                                    <button class="btn btn-primary" data-action="release" data-project="${projectName}" data-from="${currentFix}" data-to="${nextFix}">Release ${currentFix} to ${nextFix}</button>
                                    <button class="btn btn-success" data-action="add-area" data-project="${projectName}">Add Extra Area</button>
                                </div>
                            </div>
                            <div class="settings-card">
                                <h3><i class="fas fa-history icon"></i> Rollback Project</h3>
                                <div class="btn-group">
                                    <button class="btn btn-warning" data-action="rollback" data-project="${projectName}" data-fix="${currentFix}" ${!canRollback ? 'disabled' : ''}>Delete ${currentFix} Tasks</button>
                                </div>
                            </div>
                             <div class="settings-card">
                                <h3><i class="fas fa-trash-alt icon"></i> Delete Project</h3>
                                <div class="btn-group">
                                    <button class="btn btn-danger" data-action="delete-project" data-project="${projectName}">DELETE ENTIRE PROJECT</button>
                                </div>
                            </div>
                        </div>
                    </div>`;
                container.insertAdjacentHTML('beforeend', cardHTML);
            });
            container.querySelectorAll('button[data-action]').forEach(button => {
                button.addEventListener('click', (e) => {
                    const { action, project, from, to, fix } = e.target.dataset;
                    if (action === 'release') this.handleReleaseFix(project, from, to);
                    else if (action === 'add-area') this.handleAddExtraArea(project);
                    else if (action === 'rollback') this.handleRollback(project, fix);
                    else if (action === 'delete-project') this.handleDeleteProject(project);
                });
            });
        },
        renderTlSummary() {
            const tableBody = this.elements.summaryTableBody;
            tableBody.innerHTML = "";
            const uniqueProjects = [...new Set(this.state.projects.map(p => p.baseProjectName).filter(Boolean))].sort();
            
            uniqueProjects.forEach(projectName => {
                const projectHeaderRow = tableBody.insertRow();
                projectHeaderRow.className = 'summary-project-header';
                projectHeaderRow.innerHTML = `<td colspan="6">${this.formatProjectName(projectName)}</td>`;

                const projectTasks = this.state.projects.filter(p => p.baseProjectName === projectName);
                const groupedByFix = projectTasks.reduce((acc, project) => {
                    const key = project.fixCategory || 'Uncategorized';
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(project);
                    return acc;
                }, {});

                const sortedFixKeys = Object.keys(groupedByFix).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

                sortedFixKeys.forEach(fixKey => {
                    const tasksInFix = groupedByFix[fixKey];
                    const totalTasks = tasksInFix.length;
                    const completedTasks = tasksInFix.filter(p => p.status === 'Completed').length;
                    const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
                    const totalMinutes = tasksInFix.reduce((sum, task) => sum + (parseInt(task.totalMinutes, 10) || 0), 0);
                    
                    const row = tableBody.insertRow();
                    row.className = 'summary-stage-row';
                    row.insertCell().textContent = fixKey;
                    row.insertCell().textContent = totalTasks;
                    row.insertCell().textContent = completedTasks;
                    const progressCell = row.insertCell();
                    progressCell.innerHTML = `
                        <div class="progress-bar" title="${progress.toFixed(1)}%">
                            <div class="progress-bar-fill" style="width: ${progress}%;">${progress.toFixed(1)}%</div>
                        </div>`;
                    row.insertCell().textContent = totalMinutes;
                    row.insertCell().textContent = (totalMinutes / 60).toFixed(2);
                });
            });
        },
        filterAndRenderProjects() {
            this.showFilterSpinner();
            setTimeout(() => {
                let filteredProjects = [...this.state.projects];
                if (this.state.filters.project !== 'All') {
                    filteredProjects = filteredProjects.filter(p => p.baseProjectName === this.state.filters.project);
                }
                if (this.state.filters.fixCategory !== 'All') {
                    filteredProjects = filteredProjects.filter(p => p.fixCategory === this.state.filters.fixCategory);
                }
                this.renderProjects(filteredProjects);
                this.hideFilterSpinner();
            }, 100);
        },
        renderProjects(projectsToRender = this.state.projects) {
            const tableBody = this.elements.projectTableBody; const tableHead = this.elements.projectTableHead; tableBody.innerHTML = "";
            const headers = ['Fix Cat', 'Project Name', 'Area/Task', 'GSD', 'Assigned To', 'Status'];
            for (let i = 1; i <= 5; i++) {
                if (i === 1 || this.state.filters.showDays[i]) { headers.push(`Day ${i} Start`, `Day ${i} Finish`, `Day ${i} Break`); }
            }
            headers.push('Total (min)', 'Actions');
            tableHead.innerHTML = headers.map(h => `<th>${h}</th>`).join('');

            if (projectsToRender.length === 0) {
                const row = tableBody.insertRow();
                row.innerHTML = `<td colspan="${headers.length}" style="text-align:center;padding:20px;">No projects found.</td>`; return;
            }
            const groupedByProject = projectsToRender.reduce((acc, project) => {
                const key = project.baseProjectName || 'Uncategorized';
                if (!acc[key]) acc[key] = []; acc[key].push(project); return acc;
            }, {});
            const sortedProjectKeys = Object.keys(groupedByProject).sort();
            sortedProjectKeys.forEach((projectName, projectIndex) => {
                if (projectIndex > 0 && this.state.filters.project === 'All') {
                    const separatorRow = tableBody.insertRow();
                    separatorRow.className = 'project-separator-row';
                    separatorRow.innerHTML = `<td colspan="${headers.length}"></td>`;
                }
                const projectsInGroup = groupedByProject[projectName];
                const groupedByFix = projectsInGroup.reduce((acc, project) => {
                    const key = project.fixCategory || 'Uncategorized';
                    if (!acc[key]) acc[key] = []; acc[key].push(project); return acc;
                }, {});
                const sortedFixKeys = Object.keys(groupedByFix).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                sortedFixKeys.forEach((fixKey, fixIndex) => {
                    if (fixIndex > 0) {
                        const separatorRow = tableBody.insertRow();
                        separatorRow.className = 'fix-separator-row';
                        separatorRow.innerHTML = `<td colspan="${headers.length}"></td>`;
                    }

                    const fixNum = parseInt(fixKey.replace('Fix', ''), 10);
                    const tasksInFixGroup = groupedByFix[fixKey].sort((a, b) => a.areaTask.localeCompare(b.areaTask));
                    tasksInFixGroup.forEach(project => {
                        const row = tableBody.insertRow();
                        row.className = `fix-stage-${fixNum}`;
                        row.dataset.projectGroup = projectName; row.dataset.fixGroup = fixKey;
                        row.insertCell().textContent = project.fixCategory || '';
                        row.insertCell().textContent = this.formatProjectName(project.baseProjectName);
                        row.insertCell().textContent = project.areaTask || '';
                        row.insertCell().textContent = project.gsd || '';
                        
                        const assignedToCell = row.insertCell();
                        const assignedToSelect = document.createElement('select');
                        assignedToSelect.innerHTML = '<option value="">Available</option>' + this.state.users.map(u => `<option value="${u.techId}" ${project.assignedTo === u.techId ? 'selected' : ''}>${u.techId}</option>`).join('');
                        assignedToSelect.onchange = (e) => this.handleProjectUpdate(project.id, { 'assignedTo': e.target.value });
                        assignedToCell.appendChild(assignedToSelect);
                        
                        const statusCell = row.insertCell();
                        statusCell.innerHTML = `<span class="status status-${(project.status || "available").toLowerCase().replace(/[^a-z0-9]/gi, '')}">${project.status}</span>`;

                        for (let i = 1; i <= 5; i++) {
                            if (i === 1 || this.state.filters.showDays[i]) {
                                const startCell = row.insertCell();
                                startCell.className = 'time-cell';
                                startCell.innerHTML = `${project[`startTimeDay${i}`] || ''} <i class="fas fa-pencil-alt edit-icon" onclick="ProjectTrackerApp.openTimeEditModal('${project.id}', ${i})"></i>`;

                                const finishCell = row.insertCell();
                                finishCell.className = 'time-cell';
                                finishCell.innerHTML = `${project[`finishTimeDay${i}`] || ''} <i class="fas fa-pencil-alt edit-icon" onclick="ProjectTrackerApp.openTimeEditModal('${project.id}', ${i})"></i>`;

                                const breakCell = row.insertCell();
                                const breakSelect = document.createElement('select');
                                const breakOptions = { "0": "None", "15": "15m", "60": "1hr", "75": "1hr 15m", "90": "1hr 30m" };
                                const currentBreak = project[`breakDurationMinutesDay${i}`] || '0';
                                for (const value in breakOptions) {
                                    const option = document.createElement('option'); option.value = value; option.textContent = breakOptions[value];
                                    if (currentBreak == value) option.selected = true; breakSelect.appendChild(option);
                                }
                                breakSelect.onchange = (e) => this.handleProjectUpdate(project.id, { [`breakDurationMinutesDay${i}`]: e.target.value });
                                breakCell.appendChild(breakSelect);
                            }
                        }
                        
                        const totalMinCell = row.insertCell();
                        totalMinCell.className = 'total-minutes-cell';
                        totalMinCell.textContent = project.totalMinutes || '';

                        const actionsCell = row.insertCell();
                        let lastActiveDay = 0;
                        for (let i = 1; i <= 5; i++) {
                            if (project[`startTimeDay${i}`]) {
                                lastActiveDay = i;
                            }
                        }

                        for (let i = 1; i <= 5; i++) {
                            if (i === 1 || this.state.filters.showDays[i]) {
                                const startBtn = document.createElement('button');
                                startBtn.textContent = `Start D${i}`;
                                startBtn.className = 'btn btn-primary btn-small';
                                startBtn.disabled = (i === 1 && project.startTimeDay1) || (i > 1 && project.status !== 'Started Available');
                                startBtn.onclick = () => this.updateProjectState(project.id, `startDay${i}`);
                                actionsCell.appendChild(startBtn);

                                const endBtn = document.createElement('button');
                                endBtn.textContent = `End D${i}`;
                                endBtn.className = 'btn btn-warning btn-small';
                                endBtn.disabled = project.status !== `InProgressDay${i}`;
                                endBtn.onclick = () => this.updateProjectState(project.id, `endDay${i}`);
                                actionsCell.appendChild(endBtn);

                                if (i === lastActiveDay + 1 || (lastActiveDay === 0 && i === 1)) {
                                    const doneBtn = document.createElement('button');
                                    doneBtn.textContent = 'Done';
                                    doneBtn.className = 'btn btn-success btn-small';
                                    doneBtn.disabled = project.status === 'Completed';
                                    doneBtn.onclick = () => {
                                        if (confirm('Are you sure you want to mark this project as "Completed"?')) {
                                            this.handleProjectUpdate(project.id, { 'status': 'Completed' });
                                        }
                                    };
                                    actionsCell.appendChild(doneBtn);
                                }
                            }
                        }
                    });
                });
            });
        },
        renderUserManagement() {
            const tableBody = this.elements.userTableBody;
            tableBody.innerHTML = "";
            this.state.users.forEach(user => {
                const row = tableBody.insertRow();
                row.insertCell().textContent = user.name;
                row.insertCell().textContent = user.email;
                row.insertCell().textContent = user.techId;
                const actionsCell = row.insertCell();
                actionsCell.className = 'user-actions';

                const editBtn = document.createElement('button');
                editBtn.innerHTML = `<i class="fas fa-edit"></i> Edit`;
                editBtn.className = 'btn btn-warning btn-small';
                editBtn.onclick = () => this.openUserModal(user);
                actionsCell.appendChild(editBtn);

                const deleteBtn = document.createElement('button');
                deleteBtn.innerHTML = `<i class="fas fa-trash"></i> Delete`;
                deleteBtn.className = 'btn btn-danger btn-small';
                deleteBtn.onclick = () => this.handleDeleteUser(user);
                actionsCell.appendChild(deleteBtn);
            });
        },
        openUserModal(user = null) {
            this.elements.userForm.reset();
            if (user) {
                this.elements.userFormTitle.textContent = "Edit User";
                this.elements.userId.value = user.id;
                this.elements.userRow.value = user._row;
                this.elements.userName.value = user.name;
                this.elements.userEmail.value = user.email;
                this.elements.userTechId.value = user.techId;
            } else {
                this.elements.userFormTitle.textContent = "Add User";
                this.elements.userId.value = `user_${Date.now()}`;
                this.elements.userRow.value = "";
            }
            this.elements.userFormModal.style.display = 'block';
        },
        async handleUserFormSubmit(event) {
            event.preventDefault();
            const user = {
                id: this.elements.userId.value,
                name: this.elements.userName.value,
                email: this.elements.userEmail.value,
                techId: this.elements.userTechId.value,
            };
            const rowIndex = this.elements.userRow.value;

            if (rowIndex) {
                user._row = rowIndex;
                await this.updateRowInSheet(this.config.sheetNames.USERS, rowIndex, user);
            } else {
                const getHeaders = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${this.config.sheetNames.USERS}!1:1`,
                });
                const headers = getHeaders.result.values[0];
                const newRow = [headers.map(h => user[h.toLowerCase()] || "")];
                await this.appendRowsToSheet(this.config.sheetNames.USERS, newRow);
            }
            this.elements.userFormModal.style.display = 'none';
            await this.loadDataFromSheets();
            this.renderUserManagement();
        },
        async handleDeleteUser(user) {
            if (confirm(`Are you sure you want to delete user: ${user.name}?`)) {
                await this.deleteSheetRows(this.config.sheetNames.USERS, [user._row]);
                await this.loadDataFromSheets();
                this.renderUserManagement();
            }
        },
        renderAdminSettings() {
            const container = this.elements.adminSettingsView;
            container.innerHTML = `
                <div class="project-settings-card">
                    <h2>Admin Tools</h2>
                    <div class="settings-card">
                        <h3><i class="fas fa-database icon"></i> Database Maintenance</h3>
                        <p>Ensure the database headers are correct. This will add any missing columns and correct any misspelled ones.</p>
                        <div class="btn-group">
                            <button class="btn btn-warning" onclick="ProjectTrackerApp.handleFixDb()">Fix DB Headers</button>
                            <button class="btn btn-secondary" onclick="ProjectTrackerApp.handleCleanDb()">Clean & Validate DB</button>
                        </div>
                    </div>
                    <div class="settings-card" style="margin-top: 20px;">
                        <h3><i class="fas fa-archive icon"></i> Archiving</h3>
                        <p>Move all completed projects to an 'Archive' sheet to improve performance.</p>
                        <div class="btn-group">
                            <button class="btn btn-info" onclick="ProjectTrackerApp.handleArchiveProjects()">Archive Completed Projects</button>
                        </div>
                    </div>
                </div>
            `;
        },
        async handleFixDb() {
            const code = prompt("This is a sensitive operation. Please enter the admin code to proceed:");
            if (code !== "248617") { alert("Incorrect code. Operation cancelled."); return; }
            if (!confirm("Are you sure you want to check and fix the database headers?")) return;
            // Full logic for fixing DB headers
        },
        handleCleanDb() {
            const code = prompt("This is a sensitive operation. Please enter the admin code to proceed:");
            if (code !== "248617") { alert("Incorrect code. Operation cancelled."); return; }
            if (!confirm("This will scan for errors and orphaned rows. Continue?")) return;
            alert("Placeholder: Clean DB logic would run here.");
        },
        handleArchiveProjects() {
            const code = prompt("This is a sensitive operation. Please enter the admin code to proceed:");
            if (code !== "248617") { alert("Incorrect code. Operation cancelled."); return; }
            if (!confirm("Are you sure you want to archive all completed projects?")) return;
            alert("Placeholder: Archiving logic would run here.");
        },
        openTimeEditModal(projectId, day) {
            const project = this.state.projects.find(p => p.id === projectId);
            if (!project) return;
            this.elements.timeEditProjectId.value = projectId;
            this.elements.timeEditDay.value = day;
            this.elements.editStartTime.value = project[`startTimeDay${day}`] || '';
            this.elements.editFinishTime.value = project[`finishTimeDay${day}`] || '';
            this.elements.timeEditTitle.textContent = `Edit Day ${day} Time for ${project.areaTask}`;
            this.elements.timeEditModal.style.display = 'block';
        },
        async handleTimeEditSubmit(event) {
            event.preventDefault();
            const projectId = this.elements.timeEditProjectId.value;
            const day = this.elements.timeEditDay.value;
            const startTime = this.elements.editStartTime.value;
            const finishTime = this.elements.editFinishTime.value;

            const updates = {
                [`startTimeDay${day}`]: startTime,
                [`finishTimeDay${day}`]: finishTime,
            };
            
            await this.handleProjectUpdate(projectId, updates);
            this.elements.timeEditModal.style.display = 'none';
        },
        showLoading(message = "Loading...") { if (this.elements.loadingOverlay) { this.elements.loadingOverlay.querySelector('p').textContent = message; this.elements.loadingOverlay.style.display = 'flex'; } },
        hideLoading() { if (this.elements.loadingOverlay) { this.elements.loadingOverlay.style.display = 'none'; } },
        showFilterSpinner() { },
        hideFilterSpinner() { }
    };

    // Make the app object globally accessible so the inline onclicks can find it.
    window.ProjectTrackerApp = ProjectTrackerApp;
    
    ProjectTrackerApp.init();
});
