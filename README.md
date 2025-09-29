# Team123 - Project Tracker V3

A web-based project management and time-tracking tool that uses Google Sheets as a database. It is designed for teams to manage tasks, track progress, and handle disputes in a collaborative environment.

## Features

* **Dashboard:** A central view to see all projects, their current status, and manage tasks.
* **Time Tracking:** Start and end timers for daily tasks, with support for break times.
* **Project Management:** Easily add new projects, release new fix stages, and manage project areas.
* **User Management:** Add, edit, and delete users who can be assigned to tasks.
* **Dispute System:** A built-in form to file and track disputes related to specific tasks.
* **Admin Panel:** Tools for database maintenance, project archiving, and managing custom sidebar links.
* **Google Sheets Backend:** Uses the power and simplicity of a Google Sheet as a live database.
* **Google Authentication:** Secure sign-in using Google accounts (OAuth 2.0).

## How It Works

This project is a single-page application built with **HTML, CSS, and vanilla JavaScript**. It does not require a traditional server or database. Instead, it leverages the **Google Sheets API** to read and write data directly to a Google Sheet that you own.

1.  The `index.html` file provides the structure and all the different views of the application (Dashboard, Settings, etc.).
2.  The `script.js` file contains all the application logic, including authentication, data handling, and UI rendering.
3.  When a user signs in, the application uses their Google credentials to get a secure token.
4.  This token is used to make authorized calls to the Google Sheets API, allowing the app to fetch, update, and delete rows in your designated spreadsheet.

---

## Setup Guide

To get this project running, you need to configure it with your own Google Cloud and Google Sheets credentials.

### Step 1: Set Up Google Cloud Platform

You need to create a project in the Google Cloud Platform to get the necessary API keys.

1.  **Create a New Project:**
    * Go to the [Google Cloud Console](https://console.cloud.google.com/).
    * Click the project dropdown in the top bar and click **"New Project"**.
    * Give your project a name (e.g., "My Project Tracker") and click **"Create"**.

2.  **Enable the Google Sheets API:**
    * With your new project selected, navigate to the **"APIs & Services"** > **"Library"** page.
    * Search for "Google Sheets API" and click on it.
    * Click the **"Enable"** button.

3.  **Create an API Key:**
    * Go to **"APIs & Services"** > **"Credentials"**.
    * Click **"+ Create Credentials"** and select **"API key"**.
    * Copy the generated API key. You will need this for your `script.js` file.
    * It is highly recommended to restrict this key. Click on the key name, and under "Application restrictions," select "HTTP referrers (web sites)." Add the URL where you will host your tracker (e.g., `your-username.github.io/*` or `localhost` for testing).

4.  **Create an OAuth 2.0 Client ID:**
    * On the same "Credentials" page, click **"+ Create Credentials"** and select **"OAuth client ID"**.
    * If prompted, configure the "OAuth consent screen." Choose **"External"** and fill in the required fields (App name, User support email, Developer contact information). Click "Save and Continue" through the scopes and test users sections.
    * Back on the "Credentials" page, select **"Web application"** for the Application type.
    * Under **"Authorized JavaScript origins,"** add the URL where you will host your application (e.g., `http://localhost`, `http://127.0.0.1:5500`, or `https://your-username.github.io`).
    * Click **"Create"**.
    * Copy the **Client ID**. You will need this for your `script.js` file.

### Step 2: Set Up Your Google Sheet

This will be your database.

1.  **Create a New Google Sheet:**
    * Go to [sheets.google.com](https://sheets.google.com/) and create a new blank spreadsheet.
    * Give it a memorable name (e.g., "ProjectTrackerDB").

2.  **Get the Spreadsheet ID:**
    * The ID is in the URL of your spreadsheet. For example, if the URL is `https://docs.google.com/spreadsheets/d/1115bhPCYDLCheEwO6_uQfvUyq5_qMQp4h816uM26yq3rNY/edit`, the ID is `15bhPCYDLChEwO6_uQfvUyq5_qMQp4h816uM26yq3rNY`.
    * Copy this ID.

3.  **Create the Necessary Sheets (Tabs):**
    * Create the following tabs at the bottom of your spreadsheet: `Projects`, `Users`, `Disputes`, `Extras`, `Archive`, and `Notifications`.
    * **Important:** Go to the **Admin Settings** page in the live application and use the "Fix DB Headers" tool (or copy the headers from the "Sheet Header Formats" section) to ensure each sheet has the correct column headers in the first row.

4.  **Share the Sheet:**
    * Click the **"Share"** button in the top right.
    * Share the sheet with the email address of the service account you will be using or make it editable by anyone with the link if you are just testing. For most use cases with user logins, ensuring the logged-in users have edit access is sufficient.

### Step 3: Configure the Project

1.  **Open `script.js`:**
2.  Find the `config` object at the top of the file.
3.  Replace the placeholder values with the credentials you copied in the previous steps:
    ```javascript
    config: {
        google: {
            API_KEY: "YOUR_API_KEY_HERE",
            CLIENT_ID: "YOUR_CLIENT_ID_HERE.apps.googleusercontent.com",
            SPREADSHEET_ID: "YOUR_SPREADSHEET_ID_HERE",
            SCOPES: "[https://www.googleapis.com/auth/spreadsheets](https://www.googleapis.com/auth/spreadsheets)",
        },
        //...
    }
    ```

### Step 4: Running the Application

Since this is a client-side application, you can run it by simply opening the `index.html` file in your web browser. For the best results and to avoid issues with Google Authentication, it's recommended to serve the files from a local web server.

A simple way to do this is with the "Live Server" extension in Visual Studio Code.

---

## Contributing

Contributions are welcome! If you find a bug or have a feature request, please open an issue on GitHub. If you would like to contribute code, please fork the repository and submit a pull request.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
