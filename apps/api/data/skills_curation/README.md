# Skills curation drop folder

Drop `.xlsx` / `.csv` files here. Headers are flexible (case-insensitive):

| Header examples | Maps to |
|-----------------|---------|
| Skill, Name, Skill Name, Title | name |
| Category, Type, Group | category |
| Description, Definition | description |
| Aliases, Also known as, Synonyms | aliases |

Scanned on startup and via `POST /api/skills/catalog/import`.
