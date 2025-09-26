document.addEventListener('DOMContentLoaded', () => {
    const ProjectTrackerApp = {
        config: {
            google: {
                API_KEY: "AIzaSyBxlhWwf3mlS_6Q3BiUsfpH21AsbhVmDw8",
                CLIENT_ID: "221107133299-7r4vnbhpsdrnqo8tss0dqbtrr9ou683e.apps.googleusercontent.com",
                SPREADSHEET_ID: "15bhPCYDLChEwO6_uQfvUyq5_qMQp4h816uM26yq3rNY",
                SCOPES: "https://www.googleapis.com/auth/spreadsheets",
            },
            sheetNames: { PROJECTS: "Projects", USERS: "Users", DISPUTES: "Disputes", EXTRAS: "Extras", ARCHIVE: "Archive", NOTIFICATIONS: "Notifications" },
            HEADER_MAP: { 'id': 'id', 'Fix Cat': 'fixCategory', 'Project Name': 'baseProjectName', 'Area/Task': 'areaTask', 'GSD': 'gsd', 'Assigned To': 'assignedTo', 'Status': 'status', 'Day 1 Start': 'startTimeDay1', 'Day 1 Finish': 'finishTimeDay1', 'Day 1 Break': 'breakDurationMinutesDay1', 'Day 2 Start': 'startTimeDay2', 'Day 2 Finish': 'finishTimeDay2', 'Day 2 Break': 'breakDurationMinutesDay2', 'Day 3 Start': 'startTimeDay3', 'Day 3 Finish': 'finishTimeDay3', 'Day 3 Break': 'breakDurationMinutesDay3', 'Day 4 Start': 'startTimeDay4', 'Day 4 Finish': 'finishTimeDay4', 'Day 4 Break': 'breakDurationMinutesDay4', 'Day 5 Start': 'startTimeDay5', 'Day 5 Finish': 'finishTimeDay5', 'Day 5 Break': 'breakDurationMinutesDay5', 'Total (min)': 'totalMinutes', 'Last Modified': 'lastModifiedTimestamp', 'Batch ID': 'batchId' },
            DISPUTE_HEADER_MAP: { 'id': 'id', 'Block ID': 'blockId', 'Project Name': 'projectName', 'Partial': 'partial', 'Phase': 'phase', 'UID': 'uid', 'RQA TechID': 'rqaTechId', 'Reason for Dispute': 'reasonForDispute', 'Tech ID': 'techId', 'Tech Name': 'techName', 'Team': 'team', 'Type': 'type', 'Category': 'category', 'Status': 'status' },
            EXTRAS_HEADER_MAP: { 'id': 'id', 'name': 'name', 'url': 'url', 'icon': 'icon' },
            NOTIFICATIONS_HEADER_MAP: { 'id': 'id', 'message': 'message', 'projectName': 'projectName', 'timestamp': 'timestamp', 'read': 'read' },
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
            disputes: [],
            extras: [],
            notifications: [],
            isAppInitialized: false,
            filters: {
                project: 'All',
                fixCategory: 'All',
                showDays: { 1: true, 2: false, 3: false, 4: false, 5: false },
                disputeStatus: 'All',
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
            this.renderExtrasMenu();
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
                    ranges: [this.config.sheetNames.PROJECTS, this.config.sheetNames.USERS, this.config.sheetNames.DISPUTES, this.config.sheetNames.EXTRAS, this.config.sheetNames.NOTIFICATIONS],
                });
                const valueRanges = response.result.valueRanges;
                const projectsData = valueRanges.find(range => range.range.startsWith(this.config.sheetNames.PROJECTS));
                const usersData = valueRanges.find(range => range.range.startsWith(this.config.sheetNames.USERS));
                const disputesData = valueRanges.find(range => range.range.startsWith(this.config.sheetNames.DISPUTES));
                const extrasData = valueRanges.find(range => range.range.startsWith(this.config.sheetNames.EXTRAS));
                const notificationsData = valueRanges.find(range => range.range.startsWith(this.config.sheetNames.NOTIFICATIONS));

                let loadedProjects = (projectsData && projectsData.values) ? this.sheetValuesToObjects(projectsData.values, this.config.HEADER_MAP) : [];
                this.state.projects = loadedProjects.filter(p => p.baseProjectName && p.baseProjectName.trim() !== "");
                this.state.users = (usersData && usersData.values) ? this.sheetValuesToObjects(usersData.values, { 'id': 'id', 'name': 'name', 'email': 'email', 'techId': 'techId' }) : [];
                this.state.disputes = (disputesData && disputesData.values) ? this.sheetValuesToObjects(disputesData.values, this.config.DISPUTE_HEADER_MAP) : [];
                this.state.extras = (extrasData && extrasData.values) ? this.sheetValuesToObjects(extrasData.values, this.config.EXTRAS_HEADER_MAP) : [];
                
                let loadedNotifications = (notificationsData && notificationsData.values) ? this.sheetValuesToObjects(notificationsData.values, this.config.NOTIFICATIONS_HEADER_MAP) : [];
                // Filter out any blank or malformed rows from the sheet
                this.state.notifications = loadedNotifications.filter(n => n.message && n.timestamp);

                this.populateFilterDropdowns();
                this.filterAndRenderProjects();
                this.renderExtrasMenu();
                this.renderNotificationBell();
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
            const submitBtn = document.querySelector('button:disabled');
            if(submitBtn) submitBtn.disabled = false;
            
            this.showLoading("Saving...");
            try {
                const headersResult = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: this.config.google.SPREADSHEET_ID,
                    range: `${sheetName}!1:1`,
                });
                const headers = headersResult.result.values[0];
                let headerMap;
                if(sheetName === this.config.sheetNames.USERS) {
                    headerMap = { 'id': 'id', 'name': 'name', 'email': 'email', 'techid': 'techId' };
                } else if (sheetName === this.config.sheetNames.DISPUTES) {
                    headerMap = this.config.DISPUTE_HEADER_MAP;
                } else if (sheetName === this.config.sheetNames.EXTRAS) {
                    headerMap = this.config.EXTRAS_HEADER_MAP;
                } else if (sheetName === this.config.sheetNames.NOTIFICATIONS) {
                    headerMap = this.config.NOTIFICATIONS_HEADER_MAP;
                } else {
                    headerMap = this.config.HEADER_MAP;
                }
                
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
                openDashboardBtn: document.getElementById('openDashboardBtn'),
                openProjectSettingsBtn: document.getElementById('openProjectSettingsBtn'), techDashboardContainer: document.getElementById('techDashboardContainer'),
                projectSettingsView: document.getElementById('projectSettingsView'),
                openTlSummaryBtn: document.getElementById('openTlSummaryBtn'), tlSummaryView: document.getElementById('tlSummaryView'),
                summaryTableBody: document.getElementById('summaryTableBody'),
                openUserManagementBtn: document.getElementById('openUserManagementBtn'), userManagementView: document.getElementById('userManagementView'),
                userTableBody: document.getElementById('userTableBody'), addUserBtn: document.getElementById('addUserBtn'),
                openDisputeBtn: document.getElementById('openDisputeBtn'), disputeView: document.getElementById('disputeView'),
                disputeForm: document.getElementById('disputeForm'), disputesTableBody: document.getElementById('disputesTableBody'),
                disputeStatusFilter: document.getElementById('disputeStatusFilter'),
                openAdminSettingsBtn: document.getElementById('openAdminSettingsBtn'), adminSettingsView: document.getElementById('adminSettingsView'),
                timeEditModal: document.getElementById('timeEditModal'), closeTimeEditModalBtn: document.getElementById('closeTimeEditModalBtn'),
                timeEditForm: document.getElementById('timeEditForm'), timeEditTitle: document.getElementById('timeEditTitle'),
                timeEditProjectId: document.getElementById('timeEditProjectId'), timeEditDay: document.getElementById('timeEditDay'),
                editStartTime: document.getElementById('editStartTime'), editFinishTime: document.getElementById('editFinishTime'),
                editStartTimeAmPm: document.getElementById('editStartTimeAmPm'),
                editFinishTimeAmPm: document.getElementById('editFinishTimeAmPm'),
                disputeDetailsModal: document.getElementById('disputeDetailsModal'),
                closeDisputeDetailsBtn: document.getElementById('closeDisputeDetailsBtn'),
                disputeDetailsContent: document.getElementById('disputeDetailsContent'),
                notificationModal: document.getElementById('notificationModal'),
                notificationTitle: document.getElementById('notificationTitle'),
                notificationMessage: document.getElementById('notificationMessage'),
                notificationViewBtn: document.getElementById('notificationViewBtn'),
                notificationCloseBtn: document.getElementById('notificationCloseBtn'),
                notificationBell: document.getElementById('notificationBell'),
                notificationBadge: document.getElementById('notificationBadge'),
                notificationList: document.getElementById('notificationList'),
                extrasMenu: document.getElementById('extrasMenu'),
                extraFormModal: document.getElementById('extraFormModal'),
                closeExtraFormBtn: document.getElementById('closeExtraFormBtn'),
                extraForm: document.getElementById('extraForm'),
                extraFormTitle: document.getElementById('extraFormTitle'),
                extraId: document.getElementById('extraId'),
                extraRow: document.getElementById('extraRow'),
                extraName: document.getElementById('extraName'),
                extraUrl: document.getElementById('extraUrl'),
                extraIcon: document.getElementById('extraIcon'),
            };
        },
        attachEventListeners() {
            this.elements.signInBtn.onclick = () => this.handleAuthClick();
            this.elements.signOutBtn.onclick = () => this.handleSignoutClick();
            this.elements.openNewProjectModalBtn.onclick = () => this.elements.projectFormModal.classList.add('is-open');
            this.elements.closeProjectFormBtn.onclick = () => this.elements.projectFormModal.classList.remove('is-open');
            this.elements.newProjectForm.addEventListener('submit', (e) => this.handleAddProjectSubmit(e));

            this.elements.addUserBtn.onclick = () => this.openUserModal();
            this.elements.closeUserFormBtn.onclick = () => this.elements.userFormModal.classList.remove('is-open');
            this.elements.userForm.addEventListener('submit', (e) => this.handleUserFormSubmit(e));

            this.elements.closeTimeEditModalBtn.onclick = () => this.elements.timeEditModal.classList.remove('is-open');
            this.elements.timeEditForm.addEventListener('submit', (e) => this.handleTimeEditSubmit(e));
            
            this.elements.disputeForm.addEventListener('submit', (e) => this.handleDisputeFormSubmit(e));
            this.elements.disputesTableBody.addEventListener('click', (e) => this.handleDisputeActions(e));
            this.elements.closeDisputeDetailsBtn.onclick = () => this.elements.disputeDetailsModal.classList.remove('is-open');
            this.elements.disputeDetailsContent.addEventListener('click', (e) => this.handleCopyToClipboard(e));
            this.elements.disputeStatusFilter.addEventListener('change', (e) => {
                this.state.filters.disputeStatus = e.target.value;
                this.renderDisputes();
            });

            this.elements.notificationCloseBtn.onclick = () => this.elements.notificationModal.classList.remove('is-open');
            this.elements.notificationBell.onclick = () => this.toggleNotificationList();

            this.elements.closeExtraFormBtn.onclick = () => this.elements.extraFormModal.classList.remove('is-open');
            this.elements.extraForm.addEventListener('submit', (e) => this.handleExtraFormSubmit(e));

            this.elements.openDashboardBtn.onclick = () => this.switchView('dashboard');
            this.elements.openProjectSettingsBtn.onclick = () => this.switchView('settings');
            this.elements.openTlSummaryBtn.onclick = () => this.switchView('summary');
            this.elements.openUserManagementBtn.onclick = () => this.switchView('users');
            this.elements.openDisputeBtn.onclick = () => this.switchView('disputes');
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
            this.elements.disputeView.style.display = 'none';
            this.elements.adminSettingsView.style.display = 'none';

            this.elements.openDashboardBtn.classList.remove('active');
            this.elements.openProjectSettingsBtn.classList.remove('active');
            this.elements.openTlSummaryBtn.classList.remove('active');
            this.elements.openUserManagementBtn.classList.remove('active');
            this.elements.openDisputeBtn.classList.remove('active');
            this.elements.openAdminSettingsBtn.classList.remove('active');

            if (viewName === 'dashboard') {
                this.elements.techDashboardContainer.style.display = 'flex'; this.elements.openDashboardBtn.classList.add('active');
            } else if (viewName === 'settings') {
                this.renderProjectSettings(); this.elements.projectSettingsView.style.display = 'block'; this.elements.openProjectSettingsBtn.classList.add('active');
            } else if (viewName === 'summary') {
                this.renderTlSummary(); this.elements.tlSummaryView.style.display = 'block'; this.elements.openTlSummaryBtn.classList.add('active');
            } else if (viewName === 'users') {
                this.renderUserManagement(); this.elements.userManagementView.style.display = 'block'; this.elements.openUserManagementBtn.classList.add('active');
            } else if (viewName === 'disputes') {
                this.renderDisputes(); this.elements.disputeView.style.display = 'block'; this.elements.openDisputeBtn.classList.add('active');
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
            event.preventDefault(); 
            const submitBtn = this.elements.newProjectForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            this.showLoading("Adding project(s)...");
        
            const numRows = parseInt(document.getElementById('numRows').value, 10);
            const baseProjectName = document.getElementById('baseProjectName').value.trim();
            
            if (!baseProjectName) {
                alert("Project Name is required.");
                this.hideLoading();
                submitBtn.disabled = false;
                return;
            }
        
            const gsd = document.getElementById('gsd').value; 
            const batchId = `batch_${Date.now()}`;
            
            try {
                // Create new project objects and add them to the local state
                for (let i = 1; i <= numRows; i++) {
                    const newRowObj = {
                        id: `proj_${Date.now()}_${i}`, 
                        batchId, 
                        baseProjectName,
                        areaTask: `Area${String(i).padStart(2, '0')}`, 
                        gsd, 
                        fixCategory: "Fix1", 
                        status: "Available",
                        lastModifiedTimestamp: new Date().toISOString()
                    };
                    this.state.projects.push(newRowObj); // Add to local state
                }
        
                // Reorganize the entire sheet with the new data included
                await this.handleReorganizeSheet(true); 
                this.renderProjectSettings(); // Refresh the project management view
        
                // UI updates
                this.elements.projectFormModal.classList.remove('is-open');
                this.elements.newProjectForm.reset();
                
                const message = `Project "${this.formatProjectName(baseProjectName)}" was created successfully!`;
                await this.logNotification(message, baseProjectName);
                
                this.showReleaseNotification(message, baseProjectName);
        
            } catch (error) {
                alert("Error adding projects: " + error.message);
                await this.loadDataFromSheets(); // Reload on error to ensure consistency
            } finally { 
                this.hideLoading();
                submitBtn.disabled = false;
            }
        },
        calculateTotalMinutes(project) {
            let totalWorkMinutes = 0;
            for (let i = 1; i <= 5; i++) {
                const startTime = project[`startTimeDay${i}`] || '';
                const finishTime = project[`finishTimeDay${i}`] || '';
                const breakMins = parseInt(project[`breakDurationMinutesDay${i}`] || '0', 10);
                if (startTime && finishTime) {
                    let startMinutes = this.parseTimeToMinutes(startTime);
                    let finishMinutes = this.parseTimeToMinutes(finishTime);
        
                    // Handle overnight shifts
                    if (finishMinutes < startMinutes) {
                        finishMinutes += 24 * 60; // Add 24 hours in minutes
                    }
        
                    const workMinutes = finishMinutes - startMinutes;
                    if (workMinutes >= 0) { // Allow for zero minute tasks
                        totalWorkMinutes += (workMinutes - breakMins);
                    }
                }
            }
            return totalWorkMinutes > 0 ? totalWorkMinutes : '';
        },
        async handleProjectUpdate(projectId, updates) {
            const project = this.state.projects.find(p => p.id === projectId);
            if (project) {
                const tempUpdatedProject = { ...project, ...updates };
                const newTotalMinutes = this.calculateTotalMinutes(tempUpdatedProject);
                updates.totalMinutes = newTotalMinutes;
                Object.assign(project, updates, { lastModifiedTimestamp: new Date().toISOString() });
                this.filterAndRenderProjects();
                await this.updateRowInSheet(this.config.sheetNames.PROJECTS, project._row, project);
            }
        },        
        getCurrentTime() {
            const now = new Date();
            let hours = now.getHours();
            const minutes = now.getMinutes();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12; // the hour '0' should be '12'
            const minutesStr = minutes < 10 ? '0' + minutes : String(minutes);
            const hoursStr = hours < 10 ? '0' + hours : String(hours);
            return `${hoursStr}:${minutesStr} ${ampm}`;
        },
        async updateProjectState(projectId, action) {
            const project = this.state.projects.find(p => p.id === projectId);
            if (!project) return;
            const updates = { lastModifiedTimestamp: new Date().toISOString() };
            const dayMatch = action.match(/(start|end)Day(\d)/);
            if (dayMatch) {
                const [, type, day] = dayMatch;
                const dayNum = parseInt(day, 10);
                updates.status = type === 'start' ? `InProgressDay${dayNum}` : 'Started Available';
                if (type === 'start') updates[`startTimeDay${dayNum}`] = this.getCurrentTime();
                if (type === 'end') updates[`finishTimeDay${dayNum}`] = this.getCurrentTime();
            }
            await this.handleProjectUpdate(projectId, updates);
        },
        parseTimeToMinutes(timeStr) {
            if (!timeStr || typeof timeStr !== 'string') return 0;
            const time = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
            if (!time) {
                const parts = timeStr.split(':');
                if (parts.length !== 2) return 0;
                return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
            }
            let [ , hours, minutes, ampm ] = time;
            hours = parseInt(hours, 10);
            minutes = parseInt(minutes, 10);
            if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
            if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
            return hours * 60 + minutes;
        },
        formatProjectName(name) {
            if (!name) return '';
            return name.replace(/__/g, '  ').replace(/_/g, ' ');
        },
        async handleReleaseFix(baseProjectName, fromFix, toFix) {
             if (!toFix || !toFix.match(/^Fix\d+$/)) {
                alert("Invalid format for 'To Fix'. Please use 'Fix' followed by a number (e.g., 'Fix4').");
                return;
            }
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
                    delete newRowObj._row;
                    this.state.projects.push(newRowObj);
                });

                const message = `'${toFix}' was released for project '${this.formatProjectName(baseProjectName)}'!`;
                await this.logNotification(message, baseProjectName);
                await this.handleReorganizeSheet(true);
                
                this.renderProjectSettings();
                this.showReleaseNotification(message, baseProjectName);

            } catch (error) {
                alert("Error releasing fix: " + error.message);
                await this.loadDataFromSheets();
            } finally {
                this.hideLoading();
            }
        },
        async handleAddExtraArea(baseProjectName) {
            const numToAdd = parseInt(prompt("How many extra areas do you want to add?", "1"), 10);
            if (isNaN(numToAdd) || numToAdd < 1) return; 
            this.showLoading(`Adding ${numToAdd} area(s)...`);
            try {
                const projectTasks = this.state.projects.filter(p => p.baseProjectName === baseProjectName && p.fixCategory === 'Fix1');
                if (projectTasks.length === 0) throw new Error(`Could not find project: ${baseProjectName}`);
                
                const latestTask = projectTasks.sort((a, b) => a.areaTask.localeCompare(b.areaTask)).pop();
                const lastAreaNumber = parseInt((latestTask.areaTask.match(/\d+$/) || ['0'])[0], 10);
                const batchId = `batch_extra_${Date.now()}`;
        
                // Add new areas to local state
                for (let i = 1; i <= numToAdd; i++) {
                    const newAreaNumber = lastAreaNumber + i;
                    const newRowObj = { 
                        ...latestTask, 
                        id: `proj_${Date.now()}_${i}`, 
                        batchId, 
                        areaTask: `Area${String(newAreaNumber).padStart(2, '0')}`, 
                        status: "Available",
                        startTimeDay1: "", finishTimeDay1: "", breakDurationMinutesDay1: "", 
                        startTimeDay2: "", finishTimeDay2: "", breakDurationMinutesDay2: "",
                        startTimeDay3: "", finishTimeDay3: "", breakDurationMinutesDay3: "", 
                        startTimeDay4: "", finishTimeDay4: "", breakDurationMinutesDay4: "",
                        startTimeDay5: "", finishTimeDay5: "", breakDurationMinutesDay5: "", 
                        totalMinutes: "", 
                        lastModifiedTimestamp: new Date().toISOString()
                    };
                    delete newRowObj._row;
                    this.state.projects.push(newRowObj);
                }
        
                // Reorganize the sheet with the newly added areas
                await this.handleReorganizeSheet(true);
                
                alert(`${numToAdd} area(s) added successfully!`);
        
            } catch (error) {
                alert("Error adding extra areas: " + error.message);
                await this.loadDataFromSheets(); // Reload on error
            } finally { 
                this.hideLoading(); 
            }
        },
        async handleRollback(baseProjectName, fixToDelete) {
            if (!confirm(`DANGER: This will permanently delete all '${fixToDelete}' tasks for project '${this.formatProjectName(baseProjectName)}'. This cannot be undone. Continue?`)) return;
            this.showLoading(`Rolling back ${fixToDelete}...`);
            try {
                const tasksToDelete = this.state.projects.filter(p => p.baseProjectName === baseProjectName && p.fixCategory === fixToDelete);
                if (tasksToDelete.length === 0) {
                    throw new Error(`No tasks found to delete for ${fixToDelete}.`);
                }
        
                const rowNumbersToDelete = tasksToDelete.map(p => p._row);
                await this.deleteSheetRows(this.config.sheetNames.PROJECTS, rowNumbersToDelete);
                
                // Instead of a full reload, just remove from local state and re-render
                this.state.projects = this.state.projects.filter(p => !(p.baseProjectName === baseProjectName && p.fixCategory === fixToDelete));
                this.renderProjectSettings();
                this.filterAndRenderProjects(); // Also update main dashboard view if visible
                this.populateFilterDropdowns(); // Update dropdowns in case a project was removed
        
                alert(`${fixToDelete} tasks have been deleted successfully.`);
            } catch(error) {
                alert("Error rolling back project: " + error.message);
                // On error, a full reload is safer to ensure consistency
                await this.loadDataFromSheets();
                this.renderProjectSettings();
            } finally {
                this.hideLoading();
            }
        },
        async handleDeleteProject(baseProjectName) {
            if (!confirm(`EXTREME DANGER: This will permanently delete the ENTIRE project '${this.formatProjectName(baseProjectName)}', including all of its fix stages. This cannot be undone. Are you absolutely sure?`)) return;
            
            this.showLoading("Deleting project...");
            try {
                const tasksToDelete = this.state.projects.filter(p => p.baseProjectName === baseProjectName);
                if (tasksToDelete.length > 0) {
                    const rowNumbersToDelete = tasksToDelete.map(p => p._row);
                    await this.deleteSheetRows(this.config.sheetNames.PROJECTS, rowNumbersToDelete);
                }
        
                await this.loadDataFromSheets();
                this.renderProjectSettings();
                this.populateFilterDropdowns();
                alert(`Project '${this.formatProjectName(baseProjectName)}' has been deleted successfully.`);
            } catch(error) {
                alert("Error deleting project: " + error.message);
                await this.loadDataFromSheets();
            } finally {
                this.hideLoading();
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

                // Clear both values and formatting
                await gapi.client.sheets.spreadsheets.values.clear({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${this.config.sheetNames.PROJECTS}!A2:Z`, });
                const clearFormattingRequest = {
                    repeatCell: {
                        range: { sheetId: this.state.projectSheetId, startRowIndex: 1 }, // From row 2 to end
                        cell: { userEnteredFormat: {} },
                        fields: "userEnteredFormat"
                    }
                };
                 await gapi.client.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.config.google.SPREADSHEET_ID,
                    resource: { requests: [clearFormattingRequest] }
                });


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
                await this.loadDataFromSheets();
            } finally {
                this.hideLoading();
            }
        },
        renderProjectSettings() {
            const container = this.elements.projectSettingsView;
            container.innerHTML = "";
        
            const uniqueProjects = [...new Set(this.state.projects.map(p => p.baseProjectName))].sort();
            
            let tableHTML = `<div class="project-settings-card"><h2>Project Management</h2><table class="project-table">
                <thead><tr><th>Project Name</th><th>Current Stage</th><th>Next Stage</th><th>Actions</th></tr></thead>
                <tbody>`;
        
            if (uniqueProjects.length === 0) {
                tableHTML += `<tr><td colspan="4" style="text-align:center;">No projects found to configure.</td></tr>`;
            } else {
                uniqueProjects.forEach(projectName => {
                    if (!projectName) return;
        
                    const projectTasks = this.state.projects.filter(p => p.baseProjectName === projectName);
                    const fixCategories = [...new Set(projectTasks.map(p => p.fixCategory))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                    const currentFix = fixCategories.length > 0 ? fixCategories[fixCategories.length - 1] : 'Fix1';
                    const currentFixNum = parseInt(currentFix.replace('Fix', ''), 10);
                    const nextFix = `Fix${currentFixNum + 1}`;
                    const canRollback = fixCategories.length > 1;
                    const isNotFix1 = currentFix !== 'Fix1';
        
                    tableHTML += `
                        <tr>
                            <td>${this.formatProjectName(projectName)}</td>
                            <td>${currentFix}</td>
                            <td><input type="text" id="releaseToFix_${projectName}" value="${nextFix}" style="padding: 5px; border: 1px solid #ccc; border-radius: 5px; width: 80px;"></td>
                            <td class="actions-btn-group">
                                <button class="btn btn-primary btn-small" title="Release to Next Stage" data-action="release" data-project="${projectName}" data-from="${currentFix}"><i class="fas fa-rocket"></i></button>
                                <button class="btn btn-success btn-small" title="${isNotFix1 ? 'Only available for Fix1' : 'Add Extra Area'}" data-action="add-area" data-project="${projectName}" ${isNotFix1 ? 'disabled' : ''}><i class="fas fa-plus"></i></button>
                                <button class="btn btn-warning btn-small" title="Delete ${currentFix} Tasks" data-action="rollback" data-project="${projectName}" data-fix="${currentFix}" ${!canRollback ? 'disabled' : ''}><i class="fas fa-history"></i></button>
                                <button class="btn btn-danger btn-small" title="DELETE ENTIRE PROJECT" data-action="delete-project" data-project="${projectName}"><i class="fas fa-trash-alt"></i></button>
                            </td>
                        </tr>`;
                });
            }
        
            tableHTML += `</tbody></table></div>`;
            container.innerHTML = tableHTML;
        
            container.querySelectorAll('button[data-action]').forEach(button => {
                button.addEventListener('click', (e) => {
                    const targetButton = e.target.closest('button');
                    const { action, project, from, fix } = targetButton.dataset;
                    if (action === 'release') {
                        const toFixValue = document.getElementById(`releaseToFix_${project}`).value;
                        this.handleReleaseFix(project, from, toFixValue);
                    }
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
                        const btnGroup = document.createElement('div');
                        btnGroup.className = 'actions-btn-group';

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
                                let isStartDisabled = (i === 1 && (project.status !== 'Available' || !project.assignedTo)) ||
                                                      (i > 1 && !(project.status === 'Started Available' && i > lastActiveDay));
                                startBtn.disabled = isStartDisabled;
                                startBtn.onclick = () => this.updateProjectState(project.id, `startDay${i}`);
                                btnGroup.appendChild(startBtn);

                                const endBtn = document.createElement('button');
                                endBtn.textContent = `End D${i}`;
                                endBtn.className = 'btn btn-warning btn-small';
                                endBtn.disabled = project.status !== `InProgressDay${i}`;
                                endBtn.onclick = () => this.updateProjectState(project.id, `endDay${i}`);
                                btnGroup.appendChild(endBtn);
                            }
                        }
                         const doneBtn = document.createElement('button');
                        doneBtn.textContent = 'Done';
                        doneBtn.className = 'btn btn-success btn-small';
                        doneBtn.disabled = project.status === 'Completed';
                        doneBtn.onclick = () => {
                            if (confirm('Are you sure you want to mark this project as "Completed"?')) {
                                this.handleProjectUpdate(project.id, { 'status': 'Completed' });
                            }
                        };
                        btnGroup.appendChild(doneBtn);
                        actionsCell.appendChild(btnGroup);
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
            this.elements.userFormModal.classList.add('is-open');
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
                const userHeaderMap = { 'id': 'id', 'name': 'name', 'email': 'email', 'techid': 'techId' };
                const newRow = [headers.map(h => {
                    const propName = userHeaderMap[h.toLowerCase()];
                    return user[propName] || "";
                })];
                await this.appendRowsToSheet(this.config.sheetNames.USERS, newRow);
            }
            this.elements.userFormModal.classList.remove('is-open');
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
        renderDisputes() {
            this.elements.disputeStatusFilter.value = this.state.filters.disputeStatus;
            
            // Populate dropdowns that depend on dynamic data
            const techIdSelect = document.getElementById('disputeTechId');
            techIdSelect.innerHTML = '<option value="">Select Tech ID</option>' + this.state.users.map(u => `<option value="${u.techId}">${u.techId}</option>`).join('');
            techIdSelect.onchange = (e) => {
                const selectedUser = this.state.users.find(u => u.techId === e.target.value);
                document.getElementById('disputeTechName').value = selectedUser ? selectedUser.name : '';
            };

            const projectNameSelect = document.getElementById('disputeProjectName');
            const uniqueProjects = [...new Set(this.state.projects.map(p => p.baseProjectName))].sort();
            projectNameSelect.innerHTML = '<option value="">Select Project</option>' + uniqueProjects.map(p => `<option value="${p}">${this.formatProjectName(p)}</option>`).join('');
            
            // Filter disputes
            let disputesToRender = [...this.state.disputes];
            if (this.state.filters.disputeStatus !== 'All') {
                disputesToRender = disputesToRender.filter(d => (d.status || 'Open') === this.state.filters.disputeStatus);
            }

            // Render table
            const tableBody = this.elements.disputesTableBody;
            tableBody.innerHTML = "";

            if (disputesToRender.length === 0) {
                const row = tableBody.insertRow();
                row.innerHTML = `<td colspan="7" style="text-align:center;padding:20px;">No disputes found.</td>`;
                return;
            }

            disputesToRender.forEach(dispute => {
                const row = tableBody.insertRow();
                row.insertCell().textContent = this.formatProjectName(dispute.projectName);
                row.insertCell().textContent = dispute.phase;
                row.insertCell().textContent = dispute.techId;
                row.insertCell().textContent = dispute.team;
                row.insertCell().textContent = dispute.type;
                row.insertCell().innerHTML = `<span class="status status-${(dispute.status || "open").toLowerCase()}">${dispute.status || 'Open'}</span>`;

                const actionsCell = row.insertCell();
                actionsCell.className = 'actions-btn-group';
                actionsCell.innerHTML = `
                    <button class="btn btn-primary btn-small" data-action="view" data-id="${dispute.id}">View</button>
                    <button class="btn btn-secondary btn-small" data-action="copy" data-id="${dispute.id}">Copy</button>
                    <button class="btn btn-success btn-small" data-action="done" data-id="${dispute.id}" ${dispute.status === 'Done' ? 'disabled' : ''}>Done</button>
                    <button class="btn btn-danger btn-small" data-action="delete" data-id="${dispute.id}">Delete</button>
                `;
            });
        },
        async handleDisputeFormSubmit(event) {
            event.preventDefault();
            this.showLoading("Saving dispute...");

            const disputeData = {
                id: `dispute_${Date.now()}`,
                blockId: document.getElementById('disputeBlockId').value,
                projectName: document.getElementById('disputeProjectName').value,
                partial: document.getElementById('disputePartial').value,
                phase: document.getElementById('disputePhase').value,
                uid: document.getElementById('disputeUid').value,
                warning: document.getElementById('disputeWarning').value,
                rqaTechId: document.getElementById('disputeRqaTechId').value,
                reasonForDispute: document.getElementById('disputeReason').value,
                techId: document.getElementById('disputeTechId').value,
                techName: document.getElementById('disputeTechName').value,
                team: document.getElementById('disputeTeam').value,
                type: document.getElementById('disputeType').value,
                category: document.getElementById('disputeCategory').value,
                status: 'Open', // Default status is now Open
            };

            try {
                const getHeaders = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${this.config.sheetNames.DISPUTES}!1:1`,
                });
                if (!getHeaders.result.values) {
                    throw new Error(`Could not find headers in the "${this.config.sheetNames.DISPUTES}" sheet. Make sure the sheet exists and has a header row.`);
                }
                const headers = getHeaders.result.values[0];
                const newRow = [headers.map(header => disputeData[this.config.DISPUTE_HEADER_MAP[header.trim()]] || "")];
                
                await this.appendRowsToSheet(this.config.sheetNames.DISPUTES, newRow);
                
                this.elements.disputeForm.reset();
                await this.loadDataFromSheets();
                this.renderDisputes();
                alert("Dispute saved successfully!");

            } catch (error) {
                alert("Error saving dispute: " + error.message);
                console.error(error);
            } finally {
                this.hideLoading();
            }
        },
        handleDisputeActions(event) {
            const target = event.target;
            if (target.tagName === 'BUTTON') {
                const action = target.dataset.action;
                const id = target.dataset.id;
                if (!action || !id) return;

                if (action === 'view') this.handleViewDispute(id);
                if (action === 'copy') this.handleCopyDispute(id);
                if (action === 'done') this.handleUpdateDisputeStatus(id, 'Done');
                if (action === 'delete') this.handleDeleteDispute(id);
            }
        },
        handleViewDispute(disputeId) {
            const dispute = this.state.disputes.find(d => d.id === disputeId);
            if (!dispute) return;

            const techUser = this.state.users.find(u => u.techId === dispute.techId);
            const techInfo = techUser ? `${dispute.techId} (${techUser.name})` : dispute.techId;

            const content = `
                <div class="detail-row">
                    <span class="detail-label">Block ID:</span>
                    <span class="detail-value" id="detail-blockId">${dispute.blockId || ''} <i class="fas fa-copy copy-icon" data-clipboard-target="#detail-blockId"></i></span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Project:</span>
                    <span class="detail-value" id="detail-projectName">${dispute.projectName || ''} <i class="fas fa-copy copy-icon" data-clipboard-target="#detail-projectName"></i></span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Partial:</span>
                    <span class="detail-value" id="detail-partial">${dispute.partial || ''} <i class="fas fa-copy copy-icon" data-clipboard-target="#detail-partial"></i></span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Phase:</span>
                    <span class="detail-value" id="detail-phase">${dispute.phase || ''} <i class="fas fa-copy copy-icon" data-clipboard-target="#detail-phase"></i></span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">UID:</span>
                    <span class="detail-value" id="detail-uid">${dispute.uid || ''} <i class="fas fa-copy copy-icon" data-clipboard-target="#detail-uid"></i></span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Tech ID:</span>
                    <span class="detail-value" id="detail-techId">${techInfo} <i class="fas fa-copy copy-icon" data-clipboard-target="#detail-techId"></i></span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Team:</span>
                    <span class="detail-value" id="detail-team">${dispute.team || ''} <i class="fas fa-copy copy-icon" data-clipboard-target="#detail-team"></i></span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Type:</span>
                    <span class="detail-value" id="detail-type">${dispute.type || ''} <i class="fas fa-copy copy-icon" data-clipboard-target="#detail-type"></i></span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Category:</span>
                    <span class="detail-value" id="detail-category">${dispute.category || ''} <i class="fas fa-copy copy-icon" data-clipboard-target="#detail-category"></i></span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Warning:</span>
                    <span class="detail-value" id="detail-warning">${dispute.warning || ''} <i class="fas fa-copy copy-icon" data-clipboard-target="#detail-warning"></i></span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">RQA TechID:</span>
                    <span class="detail-value" id="detail-rqaTechId">${dispute.rqaTechId || ''} <i class="fas fa-copy copy-icon" data-clipboard-target="#detail-rqaTechId"></i></span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Detailed Reason:</span>
                    <span class="detail-value" id="detail-reason">${dispute.reasonForDispute || ''} <i class="fas fa-copy copy-icon" data-clipboard-target="#detail-reason"></i></span>
                </div>
            `;
            this.elements.disputeDetailsContent.innerHTML = content;
            this.elements.disputeDetailsModal.classList.add('is-open');
        },
        handleCopyToClipboard(event) {
            const target = event.target;
            if (target.classList.contains('copy-icon')) {
                const selector = target.dataset.clipboardTarget;
                const elementToCopy = document.querySelector(selector);
                if (elementToCopy) {
                    navigator.clipboard.writeText(elementToCopy.textContent.trim()).then(() => {
                        target.classList.add('copied');
                        setTimeout(() => target.classList.remove('copied'), 1500);
                    }).catch(err => console.error('Failed to copy text: ', err));
                }
            }
        },
        handleCopyDispute(disputeId) {
            const dispute = this.state.disputes.find(d => d.id === disputeId);
            if (!dispute) return;
            document.getElementById('disputeBlockId').value = dispute.blockId || '';
            document.getElementById('disputeProjectName').value = dispute.projectName || '';
            document.getElementById('disputePartial').value = dispute.partial || '';
            document.getElementById('disputePhase').value = dispute.phase || '';
            document.getElementById('disputeUid').value = dispute.uid || '';
            document.getElementById('disputeWarning').value = dispute.warning || 'N/A';
            document.getElementById('disputeRqaTechId').value = dispute.rqaTechId || '';
            document.getElementById('disputeReason').value = `Copy of: ${dispute.reasonForDispute || ''}`;
            document.getElementById('disputeTechId').value = dispute.techId || '';
            document.getElementById('disputeTechName').value = dispute.techName || '';
            document.getElementById('disputeTeam').value = dispute.team || '';
            document.getElementById('disputeType').value = dispute.type || '';
            document.getElementById('disputeCategory').value = dispute.category || '';
            alert('Dispute details copied to the form.');
        },
        async handleUpdateDisputeStatus(disputeId, newStatus) {
            const dispute = this.state.disputes.find(d => d.id === disputeId);
            if (!dispute) return;

            dispute.status = newStatus;
            await this.updateRowInSheet(this.config.sheetNames.DISPUTES, dispute._row, dispute);
            
            // Refresh the view
            this.renderDisputes();
        },
        async handleDeleteDispute(disputeId) {
            const dispute = this.state.disputes.find(d => d.id === disputeId);
            if (!dispute) return;

            if (confirm(`Are you sure you want to delete the dispute for project "${this.formatProjectName(dispute.projectName)}"?`)) {
                try {
                    await this.deleteSheetRows(this.config.sheetNames.DISPUTES, [dispute._row]);
                    await this.loadDataFromSheets();
                    this.renderDisputes();
                    alert('Dispute deleted successfully.');
                } catch (error) {
                    alert('Failed to delete dispute: ' + error.message);
                }
            }
        },
        renderAdminSettings() {
            const container = this.elements.adminSettingsView;
            container.innerHTML = `
                <div class="project-settings-card">
                    <h2>Admin Tools</h2>
                    <div class="settings-card">
                        <h3><i class="fas fa-cogs icon"></i> Extras Menu Management</h3>
                        <p>Add, edit, or delete custom links in the sidebar.</p>
                        <div id="extrasManagementTableContainer"></div>
                        <button id="addExtraBtn" class="btn btn-success" style="margin-top: 10px;"><i class="fas fa-plus"></i> Add New Link</button>
                    </div>

                    <div class="settings-card" style="margin-top: 20px;">
                        <h3><i class="fas fa-clipboard-list icon"></i> Sheet Header Formats</h3>
                        <p>Use these formats to ensure your Google Sheets are set up correctly.</p>
                        <div id="headerFormatsContainer"></div>
                    </div>

                    <div class="settings-card" style="margin-top: 20px;">
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
                     <div class="settings-card" style="margin-top: 20px;">
                        <h3><i class="fas fa-sort icon"></i> Reorganize Sheet</h3>
                        <p>Sorts the 'Projects' sheet by Project Name and Fix Stage, applying colors and adding separators. This can improve readability.</p>
                        <div class="btn-group">
                            <button class="btn" style="background-color: #34495e; color: white;" onclick="ProjectTrackerApp.handleReorganizeSheet()">Reorganize Project Sheet</button>
                        </div>
                    </div>
                </div>
            `;

            this.renderExtrasManagement();
            this.renderHeaderFormats();
            document.getElementById('addExtraBtn').onclick = () => this.openExtraModal();
            container.querySelector('#headerFormatsContainer').addEventListener('click', (e) => this.handleCopyToClipboard(e));
        },
        async handleFixDb() {
            const code = prompt("This is a sensitive operation. Please enter the admin code to proceed:");
            if (code !== "248617") { alert("Incorrect code. Operation cancelled."); return; }
            if (!confirm("Are you sure you want to check and fix the database headers?")) return;
            alert("Placeholder: DB Fix logic would run here.");
        },
        handleCleanDb() {
            const code = prompt("This is a sensitive operation. Please enter the admin code to proceed:");
            if (code !== "248617") { alert("Incorrect code. Operation cancelled."); return; }
            if (!confirm("This will scan for errors and orphaned rows. Continue?")) return;
            alert("Placeholder: Clean DB logic would run here.");
        },
        async handleArchiveProjects() {
            const code = prompt("This is a sensitive operation. Please enter the admin code to proceed:");
            if (code !== "248617") { 
                alert("Incorrect code. Operation cancelled."); 
                return; 
            }
            if (!confirm("Are you sure you want to archive all completed projects? This cannot be undone.")) return;

            this.showLoading("Archiving completed projects...");
            try {
                const projectsToArchive = this.state.projects.filter(p => p.status === 'Completed');
                if (projectsToArchive.length === 0) {
                    alert("No completed projects to archive.");
                    return;
                }

                const getHeaders = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: this.config.google.SPREADSHEET_ID,
                    range: `${this.config.sheetNames.PROJECTS}!1:1`,
                });
                const headers = getHeaders.result.values[0];

                const rowsToAppend = projectsToArchive.map(project => {
                    return headers.map(header => project[this.config.HEADER_MAP[header.trim()]] || "");
                });

                await this.appendRowsToSheet(this.config.sheetNames.ARCHIVE, rowsToAppend);
                
                const rowNumbersToDelete = projectsToArchive.map(p => p._row);
                await this.deleteSheetRows(this.config.sheetNames.PROJECTS, rowNumbersToDelete);

                await this.loadDataFromSheets();
                alert(`${projectsToArchive.length} completed project(s) have been archived successfully.`);

            } catch (error) {
                alert("Error archiving projects: " + error.message);
                console.error("Archive Error:", error);
                await this.loadDataFromSheets();
            } finally {
                this.hideLoading();
            }
        },
        openTimeEditModal(projectId, day) {
            const project = this.state.projects.find(p => p.id === projectId);
            if (!project) return;
            
            if (project.status !== 'Completed') {
                alert("Please mark the project as 'Done' before editing the time.");
                return;
            }
        
            this.elements.timeEditProjectId.value = projectId;
            this.elements.timeEditDay.value = day;
        
            const startTimeStr = project[`startTimeDay${day}`] || '';
            const finishTimeStr = project[`finishTimeDay${day}`] || '';
        
            const startTimeMatch = startTimeStr.match(/(\d+:\d+)\s*(AM|PM)/i);
            const finishTimeMatch = finishTimeStr.match(/(\d+:\d+)\s*(AM|PM)/i);
        
            this.elements.editStartTime.value = startTimeMatch ? startTimeMatch[1] : startTimeStr;
            this.elements.editStartTimeAmPm.value = startTimeMatch ? startTimeMatch[2].toUpperCase() : 'AM';
        
            this.elements.editFinishTime.value = finishTimeMatch ? finishTimeMatch[1] : finishTimeStr;
            this.elements.editFinishTimeAmPm.value = finishTimeMatch ? finishTimeMatch[2].toUpperCase() : 'PM';
        
            this.elements.timeEditTitle.textContent = `Edit Day ${day} Time for ${project.areaTask}`;
            this.elements.timeEditModal.classList.add('is-open');
        },
        async handleTimeEditSubmit(event) {
            event.preventDefault();
            const projectId = this.elements.timeEditProjectId.value;
            const day = this.elements.timeEditDay.value;
            const startTimeValue = this.elements.editStartTime.value.trim();
            const finishTimeValue = this.elements.editFinishTime.value.trim();
        
            const startTime = startTimeValue ? `${startTimeValue} ${this.elements.editStartTimeAmPm.value}` : '';
            const finishTime = finishTimeValue ? `${finishTimeValue} ${this.elements.editFinishTimeAmPm.value}` : '';
        
            const updates = {
                [`startTimeDay${day}`]: startTime,
                [`finishTimeDay${day}`]: finishTime,
            };
            
            await this.handleProjectUpdate(projectId, updates);
            this.elements.timeEditModal.classList.remove('is-open');
        },
        showReleaseNotification(message, projectFilterValue) {
            this.elements.notificationMessage.textContent = message;
            this.elements.notificationModal.classList.add('is-open');
        
            const oldBtn = this.elements.notificationViewBtn;
            const newBtn = oldBtn.cloneNode(true);
            oldBtn.parentNode.replaceChild(newBtn, oldBtn);
            this.elements.notificationViewBtn = newBtn;
        
            newBtn.onclick = () => {
                this.switchView('dashboard');
                this.populateFilterDropdowns();
                this.state.filters.project = projectFilterValue;
                this.elements.projectFilter.value = projectFilterValue;
                this.filterAndRenderProjects();
                this.elements.notificationModal.classList.remove('is-open');
            };
        },
        
        showLoading(message = "Loading...") { 
            if (this.elements.loadingOverlay) { 
                this.elements.loadingOverlay.querySelector('p').textContent = message; 
                this.elements.loadingOverlay.classList.add('is-open');
            } 
        },
        hideLoading() { 
            if (this.elements.loadingOverlay) { 
                this.elements.loadingOverlay.classList.remove('is-open');
            } 
        },
        showFilterSpinner() { },
        hideFilterSpinner() { },
        
        // =================================================================================
        // == EXTRAS & NOTIFICATIONS =======================================================
        // =================================================================================
        renderExtrasMenu() {
            const container = this.elements.extrasMenu;
            container.innerHTML = '';
            if (this.state.extras.length > 0) {
                this.state.extras.forEach(extra => {
                    const link = document.createElement('a');
                    link.href = extra.url;
                    link.target = "_blank";
                    link.className = "btn-extra";
                    link.innerHTML = `<i class="${extra.icon} icon"></i> ${extra.name}`;
                    container.appendChild(link);
                });
            }
        },
        renderExtrasManagement() {
            const container = document.getElementById('extrasManagementTableContainer');
            if (!container) return;
            
            let tableHTML = `<table class="project-table">
                <thead><tr><th>Name</th><th>URL</th><th>Icon</th><th>Actions</th></tr></thead>
                <tbody>`;

            if (this.state.extras.length > 0) {
                this.state.extras.forEach(extra => {
                    tableHTML += `
                        <tr>
                            <td>${extra.name}</td>
                            <td><span class="truncate" title="${extra.url}">${extra.url}</span></td>
                            <td><i class="${extra.icon}"></i> (${extra.icon})</td>
                            <td class="actions-btn-group">
                                <button class="btn btn-warning btn-small" onclick="ProjectTrackerApp.openExtraModal(ProjectTrackerApp.state.extras.find(e => e.id === '${extra.id}'))"><i class="fas fa-edit"></i></button>
                                <button class="btn btn-danger btn-small" onclick="ProjectTrackerApp.handleDeleteExtra('${extra.id}')"><i class="fas fa-trash"></i></button>
                            </td>
                        </tr>`;
                });
            } else {
                tableHTML += `<tr><td colspan="4" style="text-align:center;">No extra links configured.</td></tr>`;
            }
            tableHTML += `</tbody></table>`;
            container.innerHTML = tableHTML;
        },
        openExtraModal(extra = null) {
            this.elements.extraForm.reset();
            if (extra) {
                this.elements.extraFormTitle.textContent = "Edit Extra Link";
                this.elements.extraId.value = extra.id;
                this.elements.extraRow.value = extra._row;
                this.elements.extraName.value = extra.name;
                this.elements.extraUrl.value = extra.url;
                this.elements.extraIcon.value = extra.icon;
            } else {
                this.elements.extraFormTitle.textContent = "Add Extra Link";
                this.elements.extraId.value = `extra_${Date.now()}`;
                this.elements.extraRow.value = "";
            }
            this.elements.extraFormModal.classList.add('is-open');
        },
        async handleExtraFormSubmit(event) {
            event.preventDefault();
            const extra = {
                id: this.elements.extraId.value,
                name: this.elements.extraName.value,
                url: this.elements.extraUrl.value,
                icon: this.elements.extraIcon.value,
            };
            const rowIndex = this.elements.extraRow.value;

            if (rowIndex) { // Update existing
                extra._row = rowIndex;
                await this.updateRowInSheet(this.config.sheetNames.EXTRAS, rowIndex, extra);
            } else { // Add new
                const getHeaders = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${this.config.sheetNames.EXTRAS}!1:1`,
                });
                const headers = getHeaders.result.values[0];
                const newRow = [headers.map(h => extra[this.config.EXTRAS_HEADER_MAP[h.toLowerCase()]] || "")];
                await this.appendRowsToSheet(this.config.sheetNames.EXTRAS, newRow);
            }
            this.elements.extraFormModal.classList.remove('is-open');
            await this.loadDataFromSheets();
            this.renderExtrasManagement();
        },
        async handleDeleteExtra(extraId) {
            const extra = this.state.extras.find(e => e.id === extraId);
            if (!extra) return;

            if (confirm(`Are you sure you want to delete the link: ${extra.name}?`)) {
                await this.deleteSheetRows(this.config.sheetNames.EXTRAS, [extra._row]);
                await this.loadDataFromSheets();
                this.renderExtrasManagement();
            }
        },

        renderHeaderFormats() {
            const container = document.getElementById('headerFormatsContainer');
            if (!container) return;
            const headers = {
                "Projects": Object.keys(this.config.HEADER_MAP).join(', '),
                "Users": "id, name, email, techId",
                "Disputes": Object.keys(this.config.DISPUTE_HEADER_MAP).join(', '),
                "Extras": Object.keys(this.config.EXTRAS_HEADER_MAP).join(', '),
                "Archive": Object.keys(this.config.HEADER_MAP).join(', '),
                "Notifications": Object.keys(this.config.NOTIFICATIONS_HEADER_MAP).join(', '),
            };

            let content = '';
            for (const [sheet, headerString] of Object.entries(headers)) {
                content += `
                    <div class="header-format-card">
                        <h4>${sheet} Sheet</h4>
                        <div class="header-format-value" id="header-${sheet}">
                            <span>${headerString}</span>
                            <i class="fas fa-copy copy-icon" data-clipboard-target="#header-${sheet}"></i>
                        </div>
                    </div>`;
            }
            container.innerHTML = content;
        },
        async cleanupOldNotifications() {
            try {
                const allNotifications = [...this.state.notifications];
        
                if (allNotifications.length > 1) {
                    const sorted = allNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    const toDelete = sorted.slice(1);
                    const rowsToDelete = toDelete.map(n => n._row).filter(Boolean); // Ensure _row exists
                    
                    if (rowsToDelete.length > 0) {
                        await this.deleteSheetRows(this.config.sheetNames.NOTIFICATIONS, rowsToDelete);
                        toDelete.forEach(n => {
                            const index = this.state.notifications.findIndex(notif => notif.id === n.id);
                            if (index > -1) {
                                this.state.notifications.splice(index, 1);
                            }
                        });
                    }
                }
            } catch (err) {
                console.error("Failed to cleanup old notifications:", err);
            }
        },
        async logNotification(message, projectName) {
            try {
                const notification = {
                    id: `notif_${Date.now()}`,
                    message: message,
                    projectName: projectName,
                    timestamp: new Date().toISOString(),
                    read: 'FALSE'
                };
                const getHeaders = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${this.config.sheetNames.NOTIFICATIONS}!1:1`,
                });
                const headers = getHeaders.result.values[0];
                const newRow = [headers.map(h => notification[this.config.NOTIFICATIONS_HEADER_MAP[h.toLowerCase()]] || "")];
                await this.appendRowsToSheet(this.config.sheetNames.NOTIFICATIONS, newRow);
                
                notification._row = (this.state.notifications.length > 0 ? Math.max(...this.state.notifications.map(n => n._row)) : 1) + 1;
                this.state.notifications.push(notification);

                await this.cleanupOldNotifications();
                this.renderNotificationBell();

            } catch (err) {
                console.error("Failed to log notification:", err);
            }
        },
        renderNotificationBell() {
            const unreadCount = this.state.notifications.filter(n => n.read === 'FALSE').length;
            if (unreadCount > 0) {
                this.elements.notificationBadge.textContent = unreadCount;
                // This is the fix: change 'block' to 'flex' to match the CSS
                this.elements.notificationBadge.style.display = 'flex';
            } else {
                this.elements.notificationBadge.style.display = 'none';
            }
        },
        toggleNotificationList() {
            const list = this.elements.notificationList;
            if (list.style.display === 'block') {
                list.style.display = 'none';
                return;
            }
            
            const sortedNotifications = [...this.state.notifications].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
            list.innerHTML = '';

            if (sortedNotifications.length === 0) {
                list.innerHTML = '<div class="notification-item"><p>No recent notifications.</p></div>';
            } else {
                sortedNotifications.forEach(n => {
                    const item = document.createElement('div');
                    item.className = 'notification-item';
                    item.innerHTML = `<p>${n.message}</p><small>${new Date(n.timestamp).toLocaleString()}</small>`;
                    item.onclick = async () => {
                        this.switchView('dashboard');
                        
                        // Use a short delay to ensure the view switch has processed before filtering
                        setTimeout(async () => {
                            this.populateFilterDropdowns(); // Refresh dropdown before checking
                            const projectExists = Array.from(this.elements.projectFilter.options).some(opt => opt.value === n.projectName);
                            
                            if (!projectExists) {
                                alert(`Project "${this.formatProjectName(n.projectName)}" could not be found. It may have been deleted.`);
                                list.style.display = 'none';
                                return;
                            }
    
                            this.elements.projectFilter.value = n.projectName;
                            this.state.filters.project = n.projectName;
                            this.filterAndRenderProjects();
                            list.style.display = 'none';
                            
                            if (n.read === 'FALSE') {
                                const notificationInState = this.state.notifications.find(notif => notif.id === n.id);
                                if (notificationInState && notificationInState._row) {
                                    notificationInState.read = 'TRUE';
                                    await this.updateRowInSheet(this.config.sheetNames.NOTIFICATIONS, notificationInState._row, notificationInState);
                                    this.renderNotificationBell();
                                }
                            }
                        }, 100); // 100ms delay
                    };
                    list.appendChild(item);
                });
            }
            list.style.display = 'block';
        }
    };

    // Make the app object globally accessible so the inline onclicks can find it.
    window.ProjectTrackerApp = ProjectTrackerApp;
    
    ProjectTrackerApp.init();
});
