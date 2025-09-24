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
                currentPage: 1, projectsPerPage: 50, // Increased for better usability
                totalPages: 0,
            },
            disputePagination: { currentPage: 1, disputesPerPage: 15, totalPages: 0 },
            isGapiInitialized: false,
            isGisInitialized: false,
        },

        // --- ELEMENTS ---
        elements: {},

        // --- METHODS ---
        methods: {
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
                    callback: '',
                });
                this.state.isGisInitialized = true;
                this.methods.updateAuthUI.call(this);
            },

            updateAuthUI() {
                if (this.state.isGapiInitialized && this.state.isGisInitialized) {
                    if (gapi.client.getToken() === null) {
                        this.methods.handleSignedOutUser.call(this);
                    } else {
                        this.methods.handleAuthorizedUser.call(this);
                    }
                }
            },

            handleAuthClick() {
                this.tokenClient.callback = async (resp) => {
                    if (resp.error) throw (resp);
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
                document.body.classList.remove('login-view-active');
                this.elements.authWrapper.style.display = 'none';
                this.elements.mainContainer.style.display = 'flex';
                this.elements.signOutBtn.style.display = 'block';
                this.elements.userInfoDisplayDiv.style.display = 'flex';
                this.elements.userNameP.textContent = "Signed In";

                if (!this.state.isAppInitialized) {
                    await this.methods.loadDataFromSheets.call(this);
                    this.state.isAppInitialized = true;
                }
            },

            handleSignedOutUser() {
                document.body.classList.add('login-view-active');
                this.elements.authWrapper.style.display = 'block';
                this.elements.mainContainer.style.display = 'none';
                this.elements.signOutBtn.style.display = 'none';
                this.state.isAppInitialized = false;
            },

            sheetValuesToObjects(values) {
                if (!values || values.length < 2) return [];
                const headers = values[0];
                const dataRows = values.slice(1);
                return dataRows.map((row, index) => {
                    let obj = { _row: index + 2 };
                    headers.forEach((header, i) => {
                        obj[header] = row[i] || "";
                    });
                    return obj;
                });
            },

            async loadDataFromSheets() {
                this.methods.showLoading.call(this, "Loading data from Google Sheets...");
                try {
                    const response = await gapi.client.sheets.spreadsheets.values.batchGet({
                        spreadsheetId: this.config.google.SPREADSHEET_ID,
                        ranges: [this.config.sheetNames.PROJECTS, this.config.sheetNames.USERS, this.config.sheetNames.DISPUTES],
                    });

                    const [projectsData, usersData, disputesData] = response.result.valueRanges;

                    this.state.projects = this.methods.sheetValuesToObjects.call(this, projectsData.values);
                    this.state.users = this.methods.sheetValuesToObjects.call(this, usersData.values);
                    this.state.disputes = this.methods.sheetValuesToObjects.call(this, disputesData.values);
                    
                    const uniqueNames = new Set(this.state.projects.map(p => p.baseProjectName));
                    this.state.allUniqueProjectNames = Array.from(uniqueNames).sort();

                    this.methods.refreshAllViews.call(this);
                } catch (err) {
                    console.error("Error loading data from Sheets: ", err);
                    alert("Could not load data. Check your Spreadsheet ID and sheet names, and ensure the spreadsheet is shared with the appropriate permissions.");
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async updateRowInSheet(sheetName, rowIndex, dataObject) {
                this.methods.showLoading.call(this, "Saving changes...");
                try {
                    const headersResponse = await gapi.client.sheets.spreadsheets.values.get({
                        spreadsheetId: this.config.google.SPREADSHEET_ID,
                        range: `${sheetName}!1:1`,
                    });
                    const headers = headersResponse.result.values[0];
                    const values = [headers.map(header => dataObject[header] || "")];

                    await gapi.client.sheets.spreadsheets.values.update({
                        spreadsheetId: this.config.google.SPREADSHEET_ID,
                        range: `${sheetName}!A${rowIndex}`,
                        valueInputOption: 'USER_ENTERED',
                        resource: { values },
                    });
                } catch (err) {
                    console.error(`Error updating row ${rowIndex} in ${sheetName}:`, err);
                    alert("Failed to save changes.");
                } finally {
                    this.methods.hideLoading.call(this);
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
            
            // --- FULLY IMPLEMENTED METHODS ---

            setupDOMReferences() {
                // This is the same as your original setupDOMReferences method
                 this.elements = {
                    body: document.body, authWrapper: document.getElementById('auth-wrapper'), mainContainer: document.querySelector('.dashboard-wrapper'), signInBtn: document.getElementById('signInBtn'), signOutBtn: document.getElementById('signOutBtn'), clearDataBtn: document.getElementById('clearDataBtn'), userInfoDisplayDiv: document.querySelector('.user-profile'), userNameP: document.getElementById('userName'), userEmailP: document.getElementById('userEmail'), userPhotoImg: document.getElementById('userPhoto'), openTechDashboardBtn: document.getElementById('openTechDashboardBtn'), openTlDashboardBtn: document.getElementById('openTlDashboardBtn'), openSettingsBtn: document.getElementById('openSettingsBtn'), openTlSummaryBtn: document.getElementById('openTlSummaryBtn'), exportAllCsvBtn: document.getElementById('exportAllCsvBtn'), openImportCsvBtn: document.getElementById('openImportCsvBtn'), projectFormModal: document.getElementById('projectFormModal'), tlDashboard: document.getElementById('tlDashboard'), userManagementDashboard: document.getElementById('userManagementDashboard'), tlSummaryModal: document.getElementById('tlSummaryModal'), importCsvModal: document.getElementById('importCsvModal'), closeProjectFormBtn: document.getElementById('closeProjectFormBtn'), closeTlDashboardBtn: document.getElementById('closeTlDashboardBtn'), closeSettingsBtn: document.getElementById('closeSettingsBtn'), closeTlSummaryBtn: document.getElementById('closeTlSummaryBtn'), closeImportCsvBtn: document.getElementById('closeImportCsvBtn'), csvFileInput: document.getElementById('csvFileInput'), processCsvBtn: document.getElementById('processCsvBtn'), csvImportStatus: document.getElementById('csvImportStatus'), newProjectForm: document.getElementById('newProjectForm'), projectTableBody: document.getElementById('projectTableBody'), loadingOverlay: document.getElementById('loadingOverlay'), batchIdSelect: document.getElementById('batchIdSelect'), fixCategoryFilter: document.getElementById('fixCategoryFilter'), monthFilter: document.getElementById('monthFilter'), sortByFilter: document.getElementById('sortByFilter'), paginationControls: document.getElementById('paginationControls'), prevPageBtn: document.getElementById('prevPageBtn'), nextPageBtn: document.getElementById('nextPageBtn'), pageInfo: document.getElementById('pageInfo'), tlDashboardContent: document.getElementById('tlDashboardContent'), tlSummaryContent: document.getElementById('tlSummaryContent'), userManagementForm: document.getElementById('userManagementForm'), newUserName: document.getElementById('newUserName'), newUserEmail: document.getElementById('newUserEmail'), newUserTechId: document.getElementById('newUserTechId'), userManagementTableBody: document.getElementById('userManagementTableBody'), userFormButtons: document.getElementById('userFormButtons'), importUsersBtn: document.getElementById('importUsersBtn'), exportUsersBtn: document.getElementById('exportUsersBtn'), userCsvInput: document.getElementById('userCsvInput'), openDisputeBtn: document.getElementById('openDisputeBtn'), disputeModal: document.getElementById('disputeModal'), closeDisputeBtn: document.getElementById('closeDisputeBtn'), disputeForm: document.getElementById('disputeForm'), disputeTableBody: document.getElementById('disputeTableBody'), disputeProjectName: document.getElementById('disputeProjectName'), disputeTechId: document.getElementById('disputeTechId'), disputeTechName: document.getElementById('disputeTechName'), disputePaginationControls: document.getElementById('disputePaginationControls'), prevDisputePageBtn: document.getElementById('prevDisputePageBtn'), nextDisputePageBtn: document.getElementById('nextDisputePageBtn'), disputePageInfo: document.getElementById('disputePageInfo'), exportSelectedCsvBtn: document.getElementById('exportSelectedCsvBtn'), selectProjectsModal: document.getElementById('selectProjectsModal'), closeSelectProjectsBtn: document.getElementById('closeSelectProjectsBtn'), projectSelectionList: document.getElementById('projectSelectionList'), exportSelectedProjectsBtn: document.getElementById('exportSelectedProjectsBtn'), openNewProjectModalBtn: document.getElementById('openNewProjectModalBtn'), techDashboard: document.getElementById('techDashboard')
                };
            },

            attachEventListeners() {
                // Auth listeners
                this.elements.signInBtn.onclick = this.methods.handleAuthClick.bind(this);
                this.elements.signOutBtn.onclick = this.methods.handleSignoutClick.bind(this);
                
                // Other listeners
                this.elements.newProjectForm.addEventListener('submit', (e) => this.methods.handleAddProjectSubmit.call(this, e));
                this.elements.openNewProjectModalBtn.onclick = () => this.elements.projectFormModal.style.display = 'block';
                this.elements.closeProjectFormBtn.onclick = () => this.elements.projectFormModal.style.display = 'none';

                // Sidebar navigation
                this.elements.openTechDashboardBtn.onclick = () => this.methods.showDashboard.call(this, 'techDashboard');
                this.elements.openTlDashboardBtn.onclick = () => this.methods.showDashboard.call(this, 'tlDashboard');
                this.elements.openSettingsBtn.onclick = () => this.methods.showDashboard.call(this, 'userManagementDashboard');
            },
            
            showDashboard(dashboardId) {
                // Simple dashboard toggle logic
                ['techDashboard', 'tlDashboard', 'userManagementDashboard'].forEach(id => {
                    this.elements[id].classList.remove('active');
                });
                this.elements[dashboardId].classList.add('active');
            },

            refreshAllViews() {
                try {
                    this.methods.renderProjects.call(this);
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

                const headers = (await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: this.config.google.SPREADSHEET_ID, range: `${this.config.sheetNames.PROJECTS}!1:1` })).result.values[0];
                const newRows = [];
                for (let i = 1; i <= numRows; i++) {
                    const newRowObj = { id: `proj_${Date.now()}_${i}`, baseProjectName, areaTask: `Area${String(i).padStart(2, '0')}`, gsd, fixCategory: "Fix1", status: "Available", creationTimestamp: new Date().toISOString() };
                    newRows.push(headers.map(h => newRowObj[h] || ""));
                }

                try {
                    await this.methods.appendRowsToSheet.call(this, this.config.sheetNames.PROJECTS, newRows);
                    this.elements.projectFormModal.style.display = 'none';
                    await this.methods.loadDataFromSheets.call(this);
                } catch (error) {
                    alert("Error adding projects: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },
            
            async handleProjectAction(projectId, field, value) {
                const project = this.state.projects.find(p => p.id === projectId);
                if (project) {
                    project[field] = value;
                    project.lastModifiedTimestamp = new Date().toISOString();
                    await this.methods.updateRowInSheet.call(this, this.config.sheetNames.PROJECTS, project._row, project);
                    this.methods.renderProjects.call(this);
                }
            },

            renderProjects() {
                const tableBody = this.elements.projectTableBody;
                tableBody.innerHTML = "";
                if (this.state.projects.length === 0) {
                    tableBody.innerHTML = `<tr><td colspan="${this.config.NUM_TABLE_COLUMNS}" style="text-align:center;">No projects found.</td></tr>`;
                    return;
                }

                this.state.projects.forEach(project => {
                    const row = tableBody.insertRow();
                    row.dataset.projectId = project.id;
                    row.style.backgroundColor = this.config.FIX_CATEGORIES.COLORS[project.fixCategory] || '#fff';

                    // Simplified rendering logic, expand as needed
                    row.insertCell().textContent = project.fixCategory;
                    row.insertCell().textContent = project.baseProjectName;
                    row.insertCell().textContent = project.areaTask;
                    row.insertCell().textContent = project.gsd;

                    // Assigned To Dropdown
                    const assignedToCell = row.insertCell();
                    const assignedToSelect = document.createElement('select');
                    assignedToSelect.innerHTML = '<option value="">Select Tech</option>' + this.state.users.map(u => `<option value="${u.techId}" ${project.assignedTo === u.techId ? 'selected' : ''}>${u.techId}</option>`).join('');
                    assignedToSelect.onchange = (e) => this.methods.handleProjectAction.call(this, project.id, 'assignedTo', e.target.value);
                    assignedToCell.appendChild(assignedToSelect);

                    // Status
                    row.insertCell().innerHTML = `<span class="status status-${(project.status || "unknown").toLowerCase()}">${project.status}</span>`;

                    // Time Inputs and Breaks (Day 1 as example)
                    for (let i = 1; i <= 6; i++) {
                        const startCell = row.insertCell();
                        const startInput = document.createElement('input');
                        startInput.type = 'text'; // Use text for simplicity with Sheets
                        startInput.value = project[`startTimeDay${i}`] || '';
                        startInput.onchange = (e) => this.methods.handleProjectAction.call(this, project.id, `startTimeDay${i}`, e.target.value);
                        startCell.appendChild(startInput);

                        const finishCell = row.insertCell();
                        const finishInput = document.createElement('input');
                        finishInput.type = 'text';
                        finishInput.value = project[`finishTimeDay${i}`] || '';
                        finishInput.onchange = (e) => this.methods.handleProjectAction.call(this, project.id, `finishTimeDay${i}`, e.target.value);
                        finishCell.appendChild(finishInput);

                        const breakCell = row.insertCell();
                        const breakInput = document.createElement('input');
                        breakInput.type = 'number';
                        breakInput.value = project[`breakDurationMinutesDay${i}`] || 0;
                        breakInput.onchange = (e) => this.methods.handleProjectAction.call(this, project.id, `breakDurationMinutesDay${i}`, e.target.value);
                        breakCell.appendChild(breakInput);
                    }
                    
                    // Progress and Total - you would need to implement the calculation logic
                    row.insertCell().textContent = '...'; // Progress
                    row.insertCell().textContent = '...'; // Total

                    // Actions
                    const actionsCell = row.insertCell();
                    const doneButton = document.createElement('button');
                    doneButton.textContent = 'Done';
                    doneButton.className = 'btn btn-success';
                    doneButton.onclick = () => this.methods.handleProjectAction.call(this, project.id, 'status', 'Completed');
                    actionsCell.appendChild(doneButton);
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
            },
        }
    };

    ProjectTrackerApp.methods.init.call(ProjectTrackerApp);
});
