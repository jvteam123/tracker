# PCS Advanced Bonus Calculator

The PCS Advanced Bonus Calculator is a comprehensive web-based tool designed for calculating technician bonuses for multiple projects. It allows for local saving and loading of project data, detailed performance metric tracking, and transparent calculation based on predefined logic.

## ✨ Features

  * **Local Project Management**: Securely save, load, update, delete, and reorder an unlimited number of projects directly in your browser. No data ever leaves your computer.
  * **Flexible Data Input**: Paste raw tab-separated data or simply drag and drop shapefile components (`.shp`, `.dbf`, etc.) to auto-populate the data entry field.
  * **Multiple Calculation Modes**:
      * Calculate a single, selected project.
      * Calculate from raw, unsaved pasted data.
      * Calculate bonuses across all saved projects or a custom selection of multiple projects.
  * **Team Management**: Create custom teams, assign technicians, and filter results based on these teams.
  * **Performance Dashboards**: After each calculation, the tool generates:
      * **Task Leaderboard**: Rank technicians by total tasks, total points, or fix quality percentage.
      * **Workload Distribution Chart**: Visualize task assignments across all involved technicians.
      * **Overall Project Progress**: View high-level stats for the project, including overall quality and a quality breakdown by team.
  * **In-Depth Analysis**:
      * Click the info icon next to any technician in the results to see a detailed modal with a full breakdown of their points, quality calculation, and final payout.
      * View the original data rows associated with a specific technician.
  * **Merge Fixpoints**: A utility to merge multiple team shapefiles into a single dataset for easier calculation.

-----

## 🚀 How to Use

1.  **Input Project Data**:

      * **Paste Data**: Copy your tab-separated data and paste it into the "Project Data Entry" text area.
      * **Drag & Drop**: Drag and drop all the files that make up a shapefile (e.g., `.shp`, `.dbf`, `.shx`) into the text area. The tool will automatically extract the attribute data and format it.

2.  **Set Project Options**:

      * **IR Project**: Check the "Mark Project as IR" box if the project is an IR (Image Re-evaluation) project. This applies a 1.5x multiplier to all "Fix Task" points.
      * **GSD Value**: Select the correct Ground Sample Distance (GSD) from the dropdown. This affects the points awarded for certain "Fix Task" categories.

3.  **Save the Project (Optional)**:

      * Enter a unique name for the project in the "Enter Project Name" field.
      * Click the **Save Project** button. The data will be compressed and saved in your browser's local storage. You can refresh the project list to see your newly saved project in the dropdown.

4.  **Calculate Bonuses**:

      * **Single Project**: Select a project from the dropdown and click **Calculate Selected Project**.
      * **Pasted Data**: If you don't want to save, just paste the data, set the options, and click **Calculate**.
      * **Multiple Projects**:
        1.  Check the "Select specific projects to calculate" checkbox.
        2.  Hold `Ctrl` (or `Cmd` on Mac) and click to select multiple projects from the list.
        3.  Click **Calculate All Projects**.
            *To calculate *every* saved project, leave the "Select specific projects" box unchecked and click **Calculate All Projects**.*

5.  **Review Results**:

      * A detailed table will appear with the bonus results for each technician.
      * Use the search bar or the team filter checkboxes to narrow down the results.
      * Explore the "Team & Technician Performance Metrics", "Overall Project Progress", and "TL Summary" cards for deeper insights.

-----

## ⚙️ The Calculation Logic: A Head-to-Toe Breakdown

The bonus calculation is a transparent, four-step process based on the "Phili IC Fixpoints App Documentation v1.0." Here’s exactly how it works:

### Step 1: Point Calculation

The tool first calculates the **Total Points** for each technician by summing up points from different task types identified in the raw data.

  * **Fix Tasks**: These are the primary tasks. The points for each fix task are determined by its `category` and the selected `GSD Point Value`.
      * The point values for each category and GSD are stored in the `categoryValues` object in the script.
      * If the project is marked as **IR**, the total points for a fix task row are multiplied by **1.5**.
  * **QC (Quality Control) Tasks**: Each QC task is worth **1/8 (0.125) points**.
  * **i3qa (Internal 3D Quality Assurance) Tasks**: Each i3qa task is worth **1/12 (\~0.083) points**.
  * **RV (Revision) Tasks**: Points vary based on the revision round and if it's a "combo" task (0.2, 0.25, or 0.5 points).

### Step 2: Fix Quality Percentage

A technician's quality is a critical factor. It is calculated using the following formula:

```
Fix Quality % = (Fix Tasks / (Fix Tasks + Refix Tasks + Warnings)) * 100
```

  * **Fix Tasks**: The total number of correctly completed primary fix tasks.
  * **Refix Tasks**: The number of tasks that had to be redone due to errors (identified as 'I' for Incorrect in revision labels).
  * **Warnings**: The number of warnings issued to the technician (identified by specific warning codes in the data).

A higher percentage indicates better performance and fewer errors.

### Step 3: Bonus Earned Percentage

The **Fix Quality %** is then used to determine the **% of Bonus Earned** from a predefined, tiered table. This table is implemented in the `calculateQualityModifier` function.

Here are some examples from the table:

  * A quality of **100%** earns **120%** of the bonus.
  * A quality of **95%** earns **100%** of the bonus.
  * A quality of **82.5%** earns **55%** of the bonus.
  * Any quality below **77.5%** earns **0%** of the bonus.

### Step 4: Final Payout

Finally, the total payout in PHP is calculated by combining all the previous elements into one formula:

```
Final Payout (PHP) = Total Points * Bonus Multiplier * % of Bonus Earned
```

  * **Bonus Multiplier**: An optional value you can enter in the "Calculation Settings" to apply a multiplier to the final payout for all technicians (e.g., entering 1.1 provides a 10% bonus).

-----

## 🛠️ Technical Details

  * **Frontend**: The user interface is built with **HTML5**, **Tailwind CSS**, and vanilla **JavaScript**.
  * **Libraries**:
      * **Pako.js**: Used for compressing and decompressing project data before saving it to IndexedDB, allowing for efficient storage of large datasets.
      * **Sortable.js**: Powers the drag-and-drop reordering of projects.
      * **Shapefile.js**: Enables the parsing of `.shp` and `.dbf` files directly in the browser.
  * **Storage**: All project and team data is stored locally in the user's browser using **IndexedDB**, a robust client-side database.

-----

## 📁 File Structure

```
/
├── index.html       # The main HTML file containing the structure of the web page.
├── style.css        # Contains all the custom CSS styles and themeing for the application.
├── script.js        # The core JavaScript file containing all the application logic, including data parsing, calculations, and UI manipulation.
└── favicon.ico      # The application's icon.
```

-----

## ⚠️ Disclaimer

This tool is intended for personal and informational purposes only. The results generated are estimates and should be used as a general guideline. These figures are not a guarantee of actual compensation and may differ from official salary offers or personal expectations.
