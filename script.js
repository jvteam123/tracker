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
                "Fix1": { "red": 0.917, "green": 0.964, "blue": 1.0 },     // Light Blue
                "Fix2": { "red": 0.917, "green": 0.980, "blue": 0.945 },    // Light Green
                "Fix3": { "red": 1.0,   "green": 0.972, "blue": 0.882 },    // Light Yellow
                "Fix4": { "red": 0.984, "green": 0.913, "blue": 0.905 },    // Light Red
                "Fix5": { "red": 0.952, "green": 0.901, "blue": 0.972 },    // Light Purple
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
                const spreadsheet = await gapi.client.sheets.spreadsheets.get({
                    spreadsheetId: this.config.google.SPREADSHEET_ID,
                });
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
                console.error("Data Error: Failed to load data from Sheets.", err);
                alert("Could not load data. Check Spreadsheet ID, sheet names, and sharing permissions. See console (F12) for details.");
            } finally {
                this.hideLoading();
            }
        },

        async updateRowInSheet(sheetName, rowIndex, dataObject) {
            this.showLoading("Saving...");
            try {
                const getHeaders = await gapi.client.sheets.spreadsheets.values.get({
                     spreadsheetId: this.config.google.SPREADSHEET_ID,
                     range: `${sheetName}!1:1`,
                });
                const headers = getHeaders.result.values[0];
                const values = [headers.map(header => {
                    const propName = this.config.HEADER_MAP[header.trim()];
                    return dataObject[propName] !== undefined ? dataObject[propName] : "";
                })];
                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: this.config.google.SPREADSHEET_ID,
                    range: `${sheetName}!A${rowIndex}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: values }
                });
            } catch (err) {
                console.error(`Data Error: Failed to update row ${rowIndex}.`, err);
                alert("Failed to save changes. The data will be refreshed to prevent inconsistencies.");
                await this.loadDataFromSheets();
            } finally {
                this.hideLoading();
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
                        range: {
                            sheetId: this.state.projectSheetId,
                            dimension: 'ROWS',
                            startIndex: rowIndex - 1,
                            endIndex: rowIndex,
                        },
                    },
                }));
                await gapi.client.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.config.google.SPREADSHEET_ID,
                    resource: { requests },
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
                const getHeaders = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${this.config.sheetNames.PROJECTS}!1:1`,
                });
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
        
        getCurrentTime() {
            return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        },

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

        // =================================================================================
        // == PROJECT SETTINGS & ACTIONS ===================================================
        // =================================================================================
        async handleReleaseFix(baseProjectName, fromFix, toFix) {
            if (!confirm(`This will create new '${toFix}' tasks for all '${fromFix}' areas in project '${this.formatProjectName(baseProjectName)}'. The original tech will be assigned. Continue?`)) return;
            this.showLoading(`Releasing ${fromFix} to ${toFix}...`);
            try {
                const tasksToClone = this.state.projects.filter(p => p.baseProjectName === baseProjectName && p.fixCategory === fromFix);
                if (tasksToClone.length === 0) throw new Error(`No tasks found for ${baseProjectName} in ${fromFix}.`);
                const getHeaders = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${this.config.sheetNames.PROJECTS}!1:1`,
                });
                const headers = getHeaders.result.values[0]; const newRows = []; const batchId = `batch_release_${Date.now()}`;
                tasksToClone.forEach((task, index) => {
                    const newRowObj = { ...task, id: `proj_${Date.now()}_${index}`, batchId, fixCategory: toFix, status: "Available",
                        startTimeDay1: "", finishTimeDay1: "", breakDurationMinutesDay1: "", startTimeDay2: "", finishTimeDay2: "", breakDurationMinutesDay2: "",
                        startTimeDay3: "", finishTimeDay3: "", breakDurationMinutesDay3: "", startTimeDay4: "", finishTimeDay4: "", breakDurationMinutesDay4: "",
                        startTimeDay5: "", finishTimeDay5: "", breakDurationMinutesDay5: "", totalMinutes: "", lastModifiedTimestamp: new Date().toISOString()
                    };
                    delete newRowObj._row;
                    const row = headers.map(header => newRowObj[this.config.HEADER_MAP[header.trim()]] || ""); newRows.push(row);
                });
                await this.appendRowsToSheet(this.config.sheetNames.PROJECTS, newRows); await this.loadDataFromSheets();
                alert(`${fromFix} released to ${toFix} successfully!`);
            } catch (error) {
                alert("Error releasing fix: " + error.message);
            } finally { this.hideLoading(); }
        },

        async handleAddExtraArea(baseProjectName) {
            const numToAdd = parseInt(prompt("How many extra areas do you want to add?", "1"), 10);
            if (isNaN(numToAdd) || numToAdd < 1) return; this.showLoading(`Adding ${numToAdd} area(s)...`);
            try {
                const projectTasks = this.state.projects.filter(p => p.baseProjectName === baseProjectName);
                if (projectTasks.length === 0) throw new Error(`Could not find project: ${baseProjectName}`);
                const latestTask = projectTasks.sort((a, b) => a.areaTask.localeCompare(b.areaTask)).pop();
                const lastAreaNumber = parseInt((latestTask.areaTask.match(/\d+$/) || ['0'])[0], 10);
                const getHeaders = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${this.config.sheetNames.PROJECTS}!1:1`,
                });
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
                await this.deleteSheetRows(rowNumbersToDelete); await this.loadDataFromSheets();
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
                await this.deleteSheetRows(rowNumbersToDelete);
                this.state.filters.project = 'All';
                await this.loadDataFromSheets();
                alert(`Project '${this.formatProjectName(baseProjectName)}' has been deleted successfully.`);
            } catch(error) {
                alert("Error deleting project: " + error.message);
            }
        },

        async handleReorganizeSheet() {
            if (!confirm("This will reorganize the entire 'Projects' sheet by Project Name and Fix Stage, inserting blank rows and applying colors. This action cannot be undone. Are you sure?")) return;
            this.showLoading("Reorganizing sheet...");
            try {
                const getHeaders = await gapi.client.sheets.spreadsheets.values.get({
                     spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${this.config.sheetNames.PROJECTS}!1:1`,
                });
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
                                range: {
                                    sheetId: this.state.projectSheetId,
                                    startRowIndex: currentRowIndex -1,
                                    endRowIndex: currentRowIndex
                                },
                                cell: { userEnteredFormat: { backgroundColor: color } },
                                fields: "userEnteredFormat.backgroundColor"
                            }
                        });
                    }
                    lastProject = project.baseProjectName;
                    lastFix = project.fixCategory;
                });

                await gapi.client.sheets.spreadsheets.values.clear({
                    spreadsheetId: this.config.google.SPREADSHEET_ID,
                    range: `${this.config.sheetNames.PROJECTS}!A2:Z`,
                });

                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: this.config.google.SPREADSHEET_ID,
                    range: `${this.config.sheetNames.PROJECTS}!A2`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: newSheetData }
                });

                if (formattingRequests.length > 0) {
                    await gapi.client.sheets.spreadsheets.batchUpdate({
                        spreadsheetId: this.config.google.SPREADSHEET_ID,
                        resource: { requests: formattingRequests }
                    });
                }

                await this.loadDataFromSheets();
                alert("Sheet reorganized and colored successfully!");
            } catch(error) {
                console.error("Reorganization Error:", error);
                alert("Error reorganizing sheet: " + error.message);
            } finally {
                this.hideLoading();
            }
        },

        // =================================================================================
        // == FILTERING & RENDERING ========================================================
        // =================================================================================
        renderProjectSettings() { /* Unchanged */ },
        renderTlSummary() { /* Unchanged */ },
        filterAndRenderProjects() { /* Unchanged */ },
        renderProjects(projectsToRender = this.state.projects) { /* Unchanged */ },
        renderUserManagement() { /* Unchanged */ },
        showLoading(message = "Loading...") { /* Unchanged */ },
        hideLoading() { /* Unchanged */ },
        showFilterSpinner() { /* Unchanged */ },
        hideFilterSpinner() { /* Unchanged */ }
    };

    ProjectTrackerApp.init();
});
