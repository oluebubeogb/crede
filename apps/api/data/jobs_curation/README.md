# Jobs curation drop folder

Drop any `.xlsx` / `.xls` / `.csv` files here. On API startup (or `POST /api/occupations/import`), Crede scans this folder and upserts occupations.

## Flexible columns (case-insensitive; any subset works)

| Header examples | Maps to |
|-----------------|---------|
| Title EN, Title, Job Title, Occupation, Role | title |
| ISCO 08 Code, ISCO, Code | isco_code |
| Level | level |
| Definition, Description, Job Description | definition |
| Tasks include, Tasks, Responsibilities, Duties | tasks |
| Included occupations, Aliases, Also known as | aliases |
| Notes | notes |

Extra columns are stored in `extra` JSON.

Titles not in the catalog can still be typed freely; unknown titles are logged to `user_title_suggestions` for the backend team.
