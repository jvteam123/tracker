Team123 - Project Tracker V3
A web-based project management tool designed to track multi-stage projects, manage users, and handle disputes. This application uses Google Sheets as a lightweight database, making it easy to view and manage data directly.

✨ Features
Project Dashboard: A central view to see all ongoing projects, their status, assigned technicians, and logged time.

Multi-Day Time Tracking: Log start times, end times, and break durations for up to 5 separate workdays per task.

Project Management:

Create new projects with a specified number of areas and a starting "Fix Stage."

Release projects to the next fix stage.

Add extra areas to existing projects.

Roll back (delete) specific fix stages or entire projects.

User Management: Add, edit, and delete users (technicians).

Dispute System: A dedicated form to file, view, and manage project disputes.

Admin Panel: A settings area with powerful tools for database maintenance, project archiving, and managing sidebar links.

Google Sheets Backend: All data is stored and managed in a Google Sheet for easy access and editing.

Authentication: Securely sign in with Google to access the application.

⚙️ Core Technology
Frontend: HTML, CSS, Vanilla JavaScript

Backend/Database: Google Sheets

APIs: Google Sheets API, Google Identity Services (for authentication)

🚀 Setup Guide
To get the project tracker up and running, you need to configure a Google Sheet and a Google Cloud Platform project.

Part 1: Setting up the Google Sheet
This sheet will act as your database.

Create a new Google Sheet. You can do this at sheets.new.

Get the Spreadsheet ID: The ID is in the URL. For example, in https://docs.google.com/spreadsheets/d/15bhPCYDLChEwO6_uQfvUyq5_qMQp4h816uM26yq3rNY/edit, the ID is 15bhPCYDLChEwO6_uQfvUyq5_qMQp4h816uM26yq3rNY. Copy this ID; you'll need it later.

Create the Required Tabs: At the bottom of the sheet, create the following six tabs. The names must be exact.

Projects

Users

Disputes

Extras

Archive

Notifications

Set Up the Headers: Copy and paste the following headers into the first row of each corresponding tab. This step is critical for the application to work.

Projects & Archive Tabs:

id, Fix Cat, Project Name, Area/Task, GSD, Assigned To, Status, Day 1 Start, Day 1 Finish, Day 1 Break, Day 2 Start, Day 2 Finish, Day 2 Break, Day 3 Start, Day 3 Finish, Day 3 Break, Day 4 Start, Day 4 Finish, Day 4 Break, Day 5 Start, Day 5 Finish, Day 5 Break, Total (min), Last Modified, Batch ID

Users Tab:

id, name, email, techId

Disputes Tab:

id, Block ID, Project Name, Partial, Phase, UID, RQA TechID, Reason for Dispute, Tech ID, Tech Name, Team, Type, Category, Status

Extras Tab:

id, name, url, icon

Notifications Tab:

id, message, projectName, timestamp, read

Share the Sheet: Share the sheet with the Google accounts that will be using the tracker, giving them "Editor" permissions.

Part 2: Setting up the Google Cloud Project
This will provide the API keys and credentials needed to access your sheet.

Create a Google Cloud Project: Go to the Google Cloud Console and create a new project.

Enable the Google Sheets API:

In the navigation menu, go to APIs & Services > Library.

Search for "Google Sheets API" and enable it for your project.

Create Credentials:

In the navigation menu, go to APIs & Services > Credentials.

Click + CREATE CREDENTIALS and select API key. Copy the generated key immediately and save it somewhere safe. You will need it soon.

Click + CREATE CREDENTIALS again and select OAuth client ID.

For Application type, select Web application.

Under Authorized JavaScript origins, add the URLs where you will host the app. For local testing, add:

http://localhost

http://127.0.0.1

(Add the final deployed URL here when you have it)

Under Authorized redirect URIs, add the same URLs.

Click Create. Copy the Client ID and save it.

Part 3: Configuring the Application
Open the script.js file.

Find the config object at the top.

Paste your credentials:

Replace "YOUR_API_KEY_HERE" with the API key you generated.

Replace "YOUR_CLIENT_ID_HERE.apps.googleusercontent.com" with the OAuth Client ID you generated.

Replace "YOUR_SPREADSHEET_ID_HERE" with the Spreadsheet ID from your Google Sheet.

// Example of the config object in script.js
config: {
    google: {
        API_KEY: "AIzaSyBxlhWwf3mlS_6Q3BiUsfpH21AsbhVmDw8", // <-- PASTE YOUR API KEY
        CLIENT_ID: "221107133299-7r4vnbhpsdrnqo8tss0dqbtrr9ou683e.apps.googleusercontent.com", // <-- PASTE YOUR CLIENT ID
        SPREADSHEET_ID: "15bhPCYDLChEwO6_uQfvUyq5_qMQp4h816uM26yq3rNY", // <-- PASTE YOUR SPREADSHEET ID
        SCOPES: "[https://www.googleapis.com/auth/spreadsheets](https://www.googleapis.com/auth/spreadsheets)",
    },
    // ... rest of the config
},

ධ Running the Project
Place the index.html, script.js, and icon.png files in the same folder.

For local development, it's best to use a simple web server (like the "Live Server" extension in VS Code) to avoid potential CORS issues with the Google APIs.

Open the index.html file in your web browser. You should be prompted to sign in with your Google account.

🛠️ Admin Features
The "Admin Settings" panel contains powerful tools. Note that some of these actions are sensitive and are protected by a hardcoded admin code.

Admin Code: 248617

Fix DB Headers: Ensures the headers in your Google Sheet match what the application expects.

Archiving: Moves completed projects to the "Archive" tab to keep the main "Projects" sheet clean.

Reorganize Sheet: Sorts and formats the "Projects" sheet for better readability.
