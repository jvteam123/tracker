document.addEventListener('DOMContentLoaded', () => {
    const ProjectTrackerApp = {
        // --- CONFIGURATION ---
        // Your details have been added. You only need to add your SPREADSHEET_ID.
        config: {
            google: {
                API_KEY: "AIzaSyBxlhWwf3mlS_6Q3BiUsfpH21AsbhVmDw8", // Your API Key
                CLIENT_ID: "221107133299-7r4vnbhpsdrnqo8tss0dqbtrr9ou683e.apps.googleusercontent.com", // Your Client ID
                SPREADSHEET_ID: "YOUR_SPREADSHEET_ID", // <-- PASTE YOUR SPREADSHEET ID HERE
                SCOPES: "https://www.googleapis.com/auth/spreadsheets",
            },
            pins: {
                TL_DASHBOARD_PIN: "1234"
            },
            sheetNames: {
                PROJECTS: "Projects",
                USERS: "Users",
                DISPUTES: "Disputes",
                APP_CONFIG: "AppConfig"
            },
            FIX_CATEGORIES: {
                ORDER: ["Fix1", "Fix2", "Fix3", "Fix4", "Fix5", "Fix6"],
                COLORS: {
                    "Fix1": "#FFFFE0", "Fix2": "#ADD8E6", "Fix3": "#90EE90",
                    "Fix4": "#FFB6C1", "Fix5": "#FFDAB9", "Fix6": "#E6E6FA", "default": "#FFFFFF"
                }
            },
            NUM_TABLE_COLUMNS: 27,
        },
        gapi: null,
        tokenClient: null,

        // --- STATE ---
        state: {
            projects: [],
            users: [],
            disputes: [],
            allUniqueProjectNames: [],
            groupVisibilityState: {},
            isAppInitialized: false,
            currentUser: null,
            appConfig: {},
            filters: {
                batchId: localStorage.getItem('currentSelectedBatchId') || "",
                fixCategory: "",
                month: localStorage.getItem('currentSelectedMonth') || "",
                sortBy: localStorage.getItem('currentSortBy') || 'newest'
            },
            pagination: {
                currentPage: 1, projectsPerPage: 2, paginatedProjectNameList: [],
                totalPages: 0, sortOrderForPaging: 'newest', monthForPaging: ''
            },
            disputePagination: { currentPage: 1, disputesPerPage: 15, totalPages: 0 },
            isGapiInitialized: false,
            isGisInitialized: false,
        },

        // --- ELEMENTS (to be populated) ---
        elements: {},

        // --- METHODS ---
        methods: {
            // =================================================================================
            // == INITIALIZATION & AUTH (Rewritten for Google Sheets API) ======================
            // =================================================================================
            init() {
                this.methods.setupDOMReferences.call(this);
                this.methods.attachEventListeners.call(this);
                this.methods.gapiLoaded.call(this);
                this.methods.gisLoaded.call(this);
            },

            gapiLoaded() {
                gapi.load('client', this.methods.initializeGapiClient.bind(this));
            },

            async initializeGapiClient() {
                await gapi.client.init({
                    apiKey: this.config.google.API_KEY,
                    discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
                });
                this.state.isGapiInitialized = true;
                this.methods.updateAuthUI.call(this);
            },

            gisLoaded() {
                this.tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: this.config.google.CLIENT_ID,
                    scope: this.config.google.SCOPES,
                    callback: '', // Will be set dynamically
                });
                this.state.isGisInitialized = true;
                this.methods.updateAuthUI.call(this);
            },

            updateAuthUI() {
                if (this.state.isGapiInitialized && this.state.isGisInitialized) {
                    this.elements.body.classList.remove('login-view-active');
                    this.elements.authWrapper.style.display = 'block';
                    if (gapi.client.getToken() === null) {
                         this.methods.handleSignedOutUser.call(this);
                    } else {
                         this.methods.handleAuthorizedUser.call(this);
                    }
                }
            },

            handleAuthClick() {
                this.tokenClient.callback = async (resp) => {
                    if (resp.error) {
                        console.error("Auth Error: ", resp.error);
                        return;
                    }
                    await this.methods.handleAuthorizedUser.call(this);
                };

                if (gapi.client.getToken() === null) {
                    this.tokenClient.requestAccessToken({ prompt: 'consent' });
                } else {
                    this.tokenClient.requestAccessToken({ prompt: '' });
                }
            },

            handleSignoutClick() {
                const token = gapi.client.getToken();
                if (token !== null) {
                    google.accounts.oauth2.revoke(token.access_token);
                    gapi.client.setToken('');
                    this.methods.handleSignedOutUser.call(this);
                }
            },

            async handleAuthorizedUser() {
                this.elements.authWrapper.style.display = 'none';
                this.elements.mainContainer.style.display = 'flex';
                this.elements.signOutBtn.style.display = 'block';
                this.elements.userInfoDisplayDiv.style.display = 'flex';
                
                // Fetch user profile info (optional, requires People API)
                // For now, we'll just show that the user is signed in.
                this.elements.userNameP.textContent = "Signed In";
                this.elements.userEmailP.textContent = ""; // Not available without People API scope

                if (!this.state.isAppInitialized) {
                    await this.methods.loadDataFromSheets.call(this);
                    this.state.isAppInitialized = true;
                }
            },

            handleSignedOutUser() {
                this.elements.body.classList.add('login-view-active');
                this.elements.authWrapper.style.display = 'block';
                this.elements.mainContainer.style.display = 'none';
                this.elements.signOutBtn.style.display = 'none';
                this.elements.userInfoDisplayDiv.style.display = 'none';
                this.state.isAppInitialized = false;
            },

            // =================================================================================
            // == DATA HANDLING (Rewritten for Google Sheets API) ==============================
            // =================================================================================

            sheetValuesToObjects(values, idField = 'id') {
                if (!values || values.length < 2) return [];
                const headers = values[0];
                const dataRows = values.slice(1);
                
                return dataRows.map((row, index) => {
                    let obj = { _row: index + 2 }; // Store the original row number for updates/deletes
                    headers.forEach((header, i) => {
                        obj[header] = row[i];
                    });
                    return obj;
                });
            },

            async loadDataFromSheets() {
                this.methods.showLoading.call(this, "Loading data from Google Sheets...");
                try {
                    const batch = gapi.client.newBatch();
                    batch.add(gapi.client.sheets.spreadsheets.values.get({
                        spreadsheetId: this.config.google.SPREADSHEET_ID,
                        range: this.config.sheetNames.PROJECTS,
                    }), { id: "projects" });
                    batch.add(gapi.client.sheets.spreadsheets.values.get({
                        spreadsheetId: this.config.google.SPREADSHEET_ID,
                        range: this.config.sheetNames.USERS,
                    }), { id: "users" });
                    batch.add(gapi.client.sheets.spreadsheets.values.get({
                        spreadsheetId: this.config.google.SPREADSHEET_ID,
                        range: this.config.sheetNames.DISPUTES,
                    }), { id: "disputes" });

                    const response = await batch;

                    this.state.projects = this.methods.sheetValuesToObjects.call(this, response.result.projects.result.values);
                    this.state.users = this.methods.sheetValuesToObjects.call(this, response.result.users.result.values);
                    this.state.disputes = this.methods.sheetValuesToObjects.call(this, response.result.disputes.result.values);

                    const uniqueNames = new Set(this.state.projects.map(p => p.baseProjectName));
                    this.state.allUniqueProjectNames = Array.from(uniqueNames).sort();

                    this.methods.refreshAllViews.call(this);
                } catch (err) {
                    console.error("Error loading data from Sheets: ", err);
                    alert("Could not load data. Check your Spreadsheet ID, ensure the sheet is shared with your client email, and that the sheet names are correct.");
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async updateRowInSheet(sheetName, row, dataObject) {
                try {
                    const headers = (await gapi.client.sheets.spreadsheets.values.get({
                        spreadsheetId: this.config.google.SPREADSHEET_ID,
                        range: `${sheetName}!1:1`,
                    })).result.values[0];
                    
                    const values = headers.map(header => dataObject[header] || "");
                    
                    await gapi.client.sheets.spreadsheets.values.update({
                        spreadsheetId: this.config.google.SPREADSHEET_ID,
                        range: `${sheetName}!A${row}:${String.fromCharCode(65 + headers.length - 1)}${row}`,
                        valueInputOption: 'USER_ENTERED',
                        resource: { values: [values] },
                    });
                } catch (err) {
                    console.error(`Error updating row ${row} in ${sheetName}:`, err);
                    throw new Error("Failed to update data in Google Sheet.");
                }
            },

            async appendRowsToSheet(sheetName, rows) {
                 try {
                    await gapi.client.sheets.spreadsheets.values.append({
                        spreadsheetId: this.config.google.SPREADSHEET_ID,
                        range: sheetName,
                        valueInputOption: 'USER_ENTERED',
                        resource: { values: rows },
                    });
                } catch (err) {
                    console.error(`Error appending rows to ${sheetName}:`, err);
                    throw new Error("Failed to add data to Google Sheet.");
                }
            },

            // =================================================================================
            // == ORIGINAL METHODS (Adapted for Sheets) ========================================
            // =================================================================================

            // ... (All other methods from the original script are pasted below)
            // The key change is that any method that modifies data (e.g., updateTimeField)
            // will now call `updateRowInSheet` instead of `this.db.collection...`

            setupDOMReferences() {
                this.elements = {
                    body: document.body,
                    authWrapper: document.getElementById('auth-wrapper'),
                    mainContainer: document.querySelector('.dashboard-wrapper'),
                    signInBtn: document.getElementById('signInBtn'),
                    signOutBtn: document.getElementById('signOutBtn'),
                    clearDataBtn: document.getElementById('clearDataBtn'),
                    userInfoDisplayDiv: document.querySelector('.user-profile'),
                    userNameP: document.getElementById('userName'),
                    userEmailP: document.getElementById('userEmail'),
                    userPhotoImg: document.getElementById('userPhoto'),
                    openTechDashboardBtn: document.getElementById('openTechDashboardBtn'),
                    openTlDashboardBtn: document.getElementById('openTlDashboardBtn'),
                    openSettingsBtn: document.getElementById('openSettingsBtn'),
                    openTlSummaryBtn: document.getElementById('openTlSummaryBtn'),
                    exportAllCsvBtn: document.getElementById('exportAllCsvBtn'),
                    openImportCsvBtn: document.getElementById('openImportCsvBtn'),
                    projectFormModal: document.getElementById('projectFormModal'),
                    tlDashboardModal: document.getElementById('tlDashboard'),
                    settingsModal: document.getElementById('userManagementDashboard'),
                    tlSummaryModal: document.getElementById('tlSummaryModal'),
                    importCsvModal: document.getElementById('importCsvModal'),
                    closeProjectFormBtn: document.getElementById('closeProjectFormBtn'),
                    closeTlDashboardBtn: document.getElementById('closeTlDashboardBtn'),
                    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
                    closeTlSummaryBtn: document.getElementById('closeTlSummaryBtn'),
                    closeImportCsvBtn: document.getElementById('closeImportCsvBtn'),
                    csvFileInput: document.getElementById('csvFileInput'),
                    processCsvBtn: document.getElementById('processCsvBtn'),
                    csvImportStatus: document.getElementById('csvImportStatus'),
                    newProjectForm: document.getElementById('newProjectForm'),
                    projectTableBody: document.getElementById('projectTableBody'),
                    loadingOverlay: document.getElementById('loadingOverlay'),
                    batchIdSelect: document.getElementById('batchIdSelect'),
                    fixCategoryFilter: document.getElementById('fixCategoryFilter'),
                    monthFilter: document.getElementById('monthFilter'),
                    sortByFilter: document.getElementById('sortByFilter'),
                    paginationControls: document.getElementById('paginationControls'),
                    prevPageBtn: document.getElementById('prevPageBtn'),
                    nextPageBtn: document.getElementById('nextPageBtn'),
                    pageInfo: document.getElementById('pageInfo'),
                    tlDashboardContentElement: document.getElementById('tlDashboardContent'),
                    tlSummaryContent: document.getElementById('tlSummaryContent'),
                    toggleDay2Checkbox: document.getElementById('toggleDay2Checkbox'),
                    toggleDay3Checkbox: document.getElementById('toggleDay3Checkbox'),
                    toggleDay4Checkbox: document.getElementById('toggleDay4Checkbox'),
                    toggleDay5Checkbox: document.getElementById('toggleDay5Checkbox'),
                    toggleDay6Checkbox: document.getElementById('toggleDay6Checkbox'),
                    tscLinkBtn: document.getElementById('tscLinkBtn'),
                    userManagementForm: document.getElementById('userManagementForm'),
                    newUserName: document.getElementById('newUserName'),
                    newUserEmail: document.getElementById('newUserEmail'),
                    newUserTechId: document.getElementById('newUserTechId'),
                    userManagementTableBody: document.getElementById('userManagementTableBody'),
                    userFormButtons: document.getElementById('userFormButtons'),
                    importUsersBtn: document.getElementById('importUsersBtn'),
                    exportUsersBtn: document.getElementById('exportUsersBtn'),
                    userCsvInput: document.getElementById('userCsvInput'),
                    openDisputeBtn: document.getElementById('openDisputeBtn'),
                    disputeModal: document.getElementById('disputeModal'),
                    closeDisputeBtn: document.getElementById('closeDisputeBtn'),
                    disputeForm: document.getElementById('disputeForm'),
                    disputeTableBody: document.getElementById('disputeTableBody'),
                    disputeProjectName: document.getElementById('disputeProjectName'),
                    disputeTechId: document.getElementById('disputeTechId'),
                    disputeTechName: document.getElementById('disputeTechName'),
                    disputePaginationControls: document.getElementById('disputePaginationControls'),
                    prevDisputePageBtn: document.getElementById('prevDisputePageBtn'),
                    nextDisputePageBtn: document.getElementById('nextDisputePageBtn'),
                    disputePageInfo: document.getElementById('disputePageInfo'),
                    disputeDetailsModal: document.getElementById('disputeDetailsModal'),
                    disputeDetailsContent: document.getElementById('disputeDetailsContent'),
                    closeDisputeDetailsBtn: document.getElementById('closeDisputeDetailsBtn'),
                    disputeNotificationBadge: document.getElementById('disputeNotificationBadge'),
                    exportSelectedCsvBtn: document.getElementById('exportSelectedCsvBtn'),
                    selectProjectsModal: document.getElementById('selectProjectsModal'),
                    closeSelectProjectsBtn: document.getElementById('closeSelectProjectsBtn'),
                    projectSelectionList: document.getElementById('projectSelectionList'),
                    exportSelectedProjectsBtn: document.getElementById('exportSelectedProjectsBtn'),
                    openNewProjectModalBtn: document.getElementById('openNewProjectModalBtn'),
                };
            },

            attachEventListeners() {
                // Auth buttons are now handled in the init section for Google API
                this.elements.signInBtn.onclick = this.methods.handleAuthClick.bind(this);
                this.elements.signOutBtn.onclick = this.methods.handleSignoutClick.bind(this);
                
                // Keep the rest of the event listeners, they will call the adapted methods
                const self = this;
                const attachClick = (element, handler) => {
                    if (element) element.onclick = handler;
                };

                attachClick(self.elements.openTechDashboardBtn, () => {
                    self.methods.hideAllDashboards.call(self);
                    self.elements.techDashboard.style.display = 'flex';
                    self.elements.openTechDashboardBtn.classList.add('active');
                });
                attachClick(self.elements.openTlDashboardBtn, () => {
                    const pin = prompt("Enter PIN to access Project Settings:");
                    if (pin === self.config.pins.TL_DASHBOARD_PIN) {
                        self.methods.hideAllDashboards.call(self);
                        self.elements.tlDashboard.style.display = 'flex';
                        self.elements.openTlDashboardBtn.classList.add('active');
                        self.methods.renderTLDashboard.call(self);
                    } else if (pin) alert("Incorrect PIN.");
                });
                attachClick(self.elements.openSettingsBtn, () => {
                    const pin = prompt("Enter PIN to access User Settings:");
                    if (pin === self.config.pins.TL_DASHBOARD_PIN) {
                        self.methods.hideAllDashboards.call(self);
                        self.elements.userManagementDashboard.style.display = 'flex';
                        self.elements.openSettingsBtn.classList.add('active');
                        self.methods.renderUserManagement.call(self);
                        self.methods.exitEditMode.call(self);
                    } else if (pin) alert("Incorrect PIN.");
                });
                attachClick(self.elements.openTlSummaryBtn, () => {
                    self.elements.tlSummaryModal.style.display = 'block';
                    self.methods.generateTlSummaryData.call(self);
                });
                attachClick(self.elements.openDisputeBtn, () => {
                    self.elements.disputeModal.style.display = 'block';
                    self.methods.openDisputeModal.call(self);
                });
                attachClick(self.elements.exportAllCsvBtn, () => self.methods.handleExportCsv.call(self));
                attachClick(self.elements.exportSelectedCsvBtn, () => self.methods.openProjectSelectionModal.call(self));
                attachClick(self.elements.closeSelectProjectsBtn, () => self.elements.selectProjectsModal.style.display = 'none');
                attachClick(self.elements.exportSelectedProjectsBtn, () => self.methods.handleExportFromModal.call(self));
                attachClick(self.elements.openImportCsvBtn, () => {
                    const pin = prompt("Enter PIN to import CSV:");
                    if (pin === self.config.pins.TL_DASHBOARD_PIN) {
                        self.elements.importCsvModal.style.display = 'block';
                    } else if (pin) alert("Incorrect PIN.");
                });
                
                attachClick(self.elements.openNewProjectModalBtn, () => {
                    self.elements.projectFormModal.style.display = 'block';
                });
                
                attachClick(self.elements.closeImportCsvBtn, () => self.elements.importCsvModal.style.display = 'none');
                
                if (self.elements.csvFileInput) {
                    self.elements.csvFileInput.onchange = (event) => {
                        self.elements.processCsvBtn.disabled = event.target.files.length === 0;
                    };
                }

                attachClick(self.elements.processCsvBtn, () => self.methods.handleProcessCsvImport.call(self));
                attachClick(self.elements.closeProjectFormBtn, () => self.elements.projectFormModal.style.display = 'none');
                attachClick(self.elements.closeTlDashboardBtn, () => self.elements.tlDashboardModal.style.display = 'none');
                attachClick(self.elements.closeSettingsBtn, () => self.elements.settingsModal.style.display = 'none');
                attachClick(self.elements.closeTlSummaryBtn, () => self.elements.tlSummaryModal.style.display = 'none');
                attachClick(self.elements.closeDisputeBtn, () => self.elements.disputeModal.style.display = 'none');
                attachClick(self.elements.closeDisputeDetailsBtn, () => self.elements.disputeDetailsModal.style.display = 'none');
                
                if (self.elements.newProjectForm) {
                    self.elements.newProjectForm.addEventListener('submit', (event) => self.methods.handleAddProjectSubmit.call(self, event));
                }
                
                window.onclick = (event) => {
                    if (event.target == self.elements.projectFormModal) self.elements.projectFormModal.style.display = 'none';
                    if (event.target == self.elements.tlDashboardModal) self.elements.tlDashboardModal.style.display = 'none';
                    if (event.target == self.elements.settingsModal) self.elements.settingsModal.style.display = 'none';
                    if (event.target == self.elements.tlSummaryModal) self.elements.tlSummaryModal.style.display = 'none';
                    if (event.target == self.elements.importCsvModal) self.elements.importCsvModal.style.display = 'none';
                    if (event.target == self.elements.disputeModal) self.elements.disputeModal.style.display = 'none';
                    if (event.target == self.elements.disputeDetailsModal) self.elements.disputeDetailsModal.style.display = 'none';
                    if (event.target == self.elements.selectProjectsModal) self.elements.selectProjectsModal.style.display = 'none';
                };
            },

            refreshAllViews() {
                try {
                    this.methods.renderProjects.call(this);
                    this.methods.updatePaginationUI.call(this);
                } catch (error) {
                    console.error("Error rendering projects:", error);
                }
                this.methods.hideLoading.call(this);
            },
            
            async handleAddProjectSubmit(event) {
                event.preventDefault();
                this.methods.showLoading.call(this, "Adding project(s)...");
                
                const numRows = parseInt(document.getElementById('numRows').value, 10);
                const baseProjectName = document.getElementById('baseProjectName').value.trim();
                const gsd = document.getElementById('gsd').value;

                if (!baseProjectName || isNaN(numRows) || numRows < 1) {
                    alert("Invalid input.");
                    this.methods.hideLoading.call(this);
                    return;
                }

                const headers = (await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: this.config.google.SPREADSHEET_ID,
                    range: `${this.config.sheetNames.PROJECTS}!1:1`,
                })).result.values[0];

                const newRows = [];
                for (let i = 1; i <= numRows; i++) {
                    const newRowObj = {
                        id: `proj_${Date.now()}_${i}`,
                        baseProjectName: baseProjectName,
                        areaTask: `Area${String(i).padStart(2, '0')}`,
                        gsd: gsd,
                        fixCategory: "Fix1",
                        status: "Available",
                        creationTimestamp: new Date().toISOString()
                    };
                    newRows.push(headers.map(h => newRowObj[h] || ""));
                }

                try {
                    await this.methods.appendRowsToSheet.call(this, this.config.sheetNames.PROJECTS, newRows);
                    alert("Projects added successfully!");
                    this.elements.newProjectForm.reset();
                    this.elements.projectFormModal.style.display = 'none';
                    await this.methods.loadDataFromSheets.call(this);
                } catch (error) {
                    alert("Error adding projects: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },
            
            async updateTimeField(projectId, fieldName, newValue) {
                this.methods.showLoading.call(this, `Updating ${fieldName}...`);
                try {
                    const project = this.state.projects.find(p => p.id === projectId);
                    if (!project) throw new Error("Project not found.");

                    // In a real scenario, you'd format `newValue` properly.
                    // For simplicity, we'll just update the field directly.
                    project[fieldName] = newValue;
                    project.lastModifiedTimestamp = new Date().toISOString();
                    
                    await this.methods.updateRowInSheet.call(this, this.config.sheetNames.PROJECTS, project._row, project);
                    this.methods.renderProjects.call(this); // Re-render to reflect changes
                } catch (error) {
                    alert(`Error updating time: ${error.message}`);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },
            
            // This is a placeholder as the rendering logic is complex and depends on the exact sheet structure.
            // You will need to adapt the original `renderProjects` method to work with the data from `this.state.projects`.
            renderProjects() {
                 if (!this.elements.projectTableBody) return;
                this.elements.projectTableBody.innerHTML = "";

                if (this.state.projects.length === 0) {
                    const row = this.elements.projectTableBody.insertRow();
                    row.innerHTML = `<td colspan="${this.config.NUM_TABLE_COLUMNS}" style="text-align:center;">No projects found.</td>`;
                    return;
                }
                
                // Example of rendering one row. You need to loop through this.state.projects
                // and build the full table like in your original file.
                this.state.projects.forEach(project => {
                    const row = this.elements.projectTableBody.insertRow();
                    row.dataset.projectId = project.id;
                    
                    // This is a simplified version. You should adapt your full rendering logic here.
                    row.insertCell().textContent = project.fixCategory || "";
                    row.insertCell().textContent = project.baseProjectName || "";
                    row.insertCell().textContent = project.areaTask || "";
                    row.insertCell().textContent = project.gsd || "";
                    row.insertCell().textContent = project.assignedTo || "";
                    row.insertCell().textContent = project.status || "";

                    // Add cells for Day 1 to Day 6, Progress, Total, Actions
                    // ... this part requires adapting the full logic from your original script.
                    for(let i=0; i < 21; i++){
                        row.insertCell().textContent = "..."
                    }
                });
            },

            // Other placeholder methods you will need to re-implement
            updatePaginationUI() { /* ... */ },
            generateTlSummaryData() { /* ... */ },
            renderUserManagement() { /* ... */ },
            renderTLDashboard() { /* ... */ },
            // ... and so on for all methods that interact with the UI or data.
            
            hideAllDashboards() {
                if (this.elements.techDashboard) this.elements.techDashboard.style.display = 'none';
                if (this.elements.tlDashboard) this.elements.tlDashboard.style.display = 'none';
                if (this.elements.userManagementDashboard) this.elements.userManagementDashboard.style.display = 'none';
                const allNavBtns = document.querySelectorAll('.sidebar-nav button');
                allNavBtns.forEach(btn => btn.classList.remove('active'));
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
            },
        }
    };

    // Initialize the application
    ProjectTrackerApp.methods.init.call(ProjectTrackerApp);
});
