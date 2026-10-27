# Curriculum recovery - 24 October 2026

Recovered **27 missing subjects**, preserving the four current records, for **31 BSIT First Semester subjects**. The user does not need to re-enter these recovered subjects.

## Root cause

The original editor left saved subject codes and names directly editable. Entering a different course into the same saved row sent an update with the same subject ID. The success message confirmed that update, while the earlier course name/code was overwritten. The remaining four rows had versions 10, 9, 4 and 8; their department/year assignments were unchanged. This was an editing/persistence distinction, not a semester filter hiding intact rows.

## Recovery evidence and safeguards

- Before changing the catalog, captured the live catalog, subject/assignment relation files and retained WAL into the git-ignored `.tmp/curriculum-recovery-20261024/` directory. Raw WAL remains local and is not included in documentation or source control.
- Used the installed PostgreSQL `pg_waldump` utility on the copies to extract subject-table full-page images. Decoded original subject tuples from those images and the two remaining prefix/suffix-compressed update records. See the official [pg_waldump documentation](https://www.postgresql.org/docs/current/pgwaldump.html) and [heap WAL format](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/include/access/heapam_xlog.h).
- Verified all 31 recovered versions with `pg_xact_status`: each belongs to a committed transaction. Excluded two failed duplicate inserts belonging to aborted transactions.
- Restored only the recovered codes/names, using the original BSIT year association and First Semester designation. No sample curriculum or guessed subject was added. Original spellings and internal spacing are retained.
- Preserved the four current subject IDs and their class relationships. Restoration asserts that class names/codes/subject links and class memberships are unchanged.
- Recovery was transactional and refused conflicting existing names or changed source records. A second dry run reported all 31 already present and zero further restores.

## Restored catalog

| Year | Total saved | Newly recovered | Previously present |
| --- | ---: | ---: | ---: |
| 1 | 10 | 9 | 1 |
| 2 | 9 | 8 | 1 |
| 3 | 4 | 3 | 1 |
| 4 | 8 | 7 | 1 |

### BSIT Year 1 - First Semester

| Code | Subject |
| --- | --- |
| ITF101 | Introduction to Computing |
| CP1 | Computer Programming 1 |
| GE1 | Mathematics in the Modern World |
| GE2 | Understanding the Self |
| PE1 | Physical Education 1 |
| OPT1 | Office Productivity Tools 1 |
| CSS1 | Computer Systems Servicing 1 |
| GE3 | Purposive Communication |
| GUIDANCE 1 | Adjustment to College Life/ Emotional Intelligence |
| NSTP 1 | National Service Training Program 1 |

### BSIT Year 2 - First Semester

| Code | Subject |
| --- | --- |
| CP3 | Data Structure  1 |
| DLD1 | Digital Logic Design |
| PT1 | Platform Technologies 1 |
| GE6 | Art Appreciation |
| OOP1 | Object Oriented Programming 1 |
| GE7 | Reading Visual Art |
| ADV101 | Application Development and Emerging Technologies 1 |
| PE3 | Physical Education 3 |
| DA101 | Database Administration |

### BSIT Year 3 - First Semester

| Code | Subject |
| --- | --- |
| CP5 | Event-Driven Programming |
| IAS1 | Information Assurance and Security |
| ITPE1 | Emerging Web Dev Tools 1 |
| RM101 | Research Methods |

### BSIT Year 4 - First Semester

| Code | Subject |
| --- | --- |
| CAP101 | Capstone Project 1 |
| CAP102 | Capstone Project 2 |
| SA101 | System Administration and Maintenance |
| IPT1 | Integrative Programming and Technologies |
| ITPE3 | Emerging Web Dev Tools 2 |
| GE9 | Ethics |
| GE10 | Life and Works of Rizal |
| OJT | Practicum |

## Prevention

Saved subject names/codes now remain read-only until **Edit existing subject** is explicitly chosen. **Add subject** creates a clearly marked new unsaved row. Counts distinguish saved assignments from new unsaved assignments. Editing rows stay visible while a search filter is applied. The backend rejects a changed existing code/name unless `editExisting: true` was explicitly supplied.

A new `curriculum_change_history` table records before/after JSON snapshots through database triggers on subject and assignment inserts/updates, in the same transaction. Existing records receive an idempotent baseline. Authorized curriculum staff can retrieve history through `GET /api/classes/curriculum/history`, optionally with `?subjectId=...`; ordinary teachers and students are denied. This history preserves prior identities for future authorized recovery.

## Artifacts and operator tool

- [Verified original entries](recovered-curriculum-2026-10-24.json): recovered values, original row/version, committed transaction ID, source timestamp and WAL/page evidence.
- [Applied recovery result](curriculum-recovery-result-2026-10-24.json): the actual restored/preserved IDs and department/year/semester assignments.
- `backend/restore-curriculum.mjs`: operator-only recovery tool; dry-run default, explicit `--apply` for mutation, collision checks, and class/membership preservation checks. This is never run by application startup. A dry run performs normal idempotent schema/history initialization but does not change curriculum entries.

## Verification

- Actual post-recovery database counts: 10 / 9 / 4 / 8 active BSIT First Semester subjects.
- Repeat recovery dry run: 31 preserved, 0 to restore.
- Curriculum integration: **1,068 HTTP checks passed**, including prevention of implicit replacement, preserved values/version after rejection, explicit edits with before/after history, and restricted history access.
- Semester integration: **395 HTTP checks passed** across all 40 department/year/semester combinations, with multiple saved subjects, COR and approval, and historical access.
- Existing server-rendered LMS UI checks passed. Production builds and targeted lint are recorded in the completion response.

Refresh the Subjects page or select Refresh catalog to load the recovered records. Use Add subject for additional courses; Edit existing subject changes the saved record.
