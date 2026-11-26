# Curriculum architecture

SKEIN TheoryLab will support progressive, data-driven study alongside its reference library. Curricula describe what to learn, what prior knowledge is expected, and how a learner can demonstrate each objective. This document proposes the content model and authoring standards for future implementation.

## Hierarchy

| Level | Responsibility |
| --- | --- |
| Learning pathway | Groups courses or volumes around a learning goal and recommends a route through them. |
| Course or volume | Groups modules with a shared scope, entry expectations and outcomes. |
| Module | Groups related lessons and may include a cumulative assessment. |
| Lesson | Defines measurable objectives and an ordered set of teaching and practice activities. |
| Learning resource | Provides teaching or reference material through an existing or future Content Engine resource. |
| Exercise | Provides guided, formative practice with feedback and may contribute evidence toward completion. |
| Assessment | Measures one or more objectives using explicit requirements and completion or passing criteria. |

The first four levels form the curriculum tree. A lesson can interleave resource, exercise and assessment references in any order. An assessment can reference several exercises and can also be attached to a module, course or pathway as a checkpoint. A resource or exercise can be reused by multiple lessons under its existing catalogue ID.

## Identity, ordering and progression

- Give pathways, courses, modules, lessons, exercises and assessments stable IDs. Give learning objectives stable IDs when they are referenced by completion criteria or assessment evidence. Keep IDs across moves, renames and compatible edits. Use a new ID when an objective or activity changes enough that prior evidence would no longer demonstrate it.
- Store ordered child references in the curriculum data. A default order and optional named sequences recommend a route through the same nodes. Store prerequisites as explicit references with required evidence, such as lesson completion or an assessment pass. Keep mandatory and optional lesson status on the module’s lesson entries so the same lesson can serve different roles in different sequences.
- Record difficulty, estimated study time in minutes, objectives and completion criteria on each lesson. Aggregate study estimates at higher levels with required and optional work reported separately. Address prerequisites and time estimates in the learner-facing overview.
- Express completion and assessment requirements as declarative rules over recorded evidence. A rule may require completing specified activities, submitting a worksheet, or attaining a defined assessment threshold. Authors specify the evidence type, required assessment IDs and passing conditions. Explicitly define whether a self-attestation counts, especially for offline work. Opening a lesson alone supplies no assessment evidence.
- Version the curriculum schema separately from each curriculum release, the pack format and catalogue resource revisions. Reference assets by stable resource ID and pin revisions where reproducibility matters, such as assessment prompts, rubrics and model answers. The Learning Engine owns attempts and completion records and records the curriculum and assessment revisions used. Compatible updates can carry evidence forward. Changed criteria require an explicit mapping or reassessment while preserving historical results.

## Lesson standards and educational objectives

Write objectives as observable actions such as reading and writing notation, identifying intervals by ear and on the staff, analysing harmonic function, or applying voice-leading principles in a short score. Match practice and assessment to the stated objective. A recommended progression can move from pitch, rhythm, metre and notation literacy to intervals, scales and keys, then to chords, cadences, analysis, counterpoint and composition. Author alternative routes and optional enrichment in the curriculum data.

Lessons may combine structured theory explanations, interactive demonstrations, musical notation, PDF cheat sheets, printable worksheets, separate answer sheets, audio demonstrations, ear-training exercises, interactive questions, and notation-based assessments. Use accessible text and labels, include alternative explanations where appropriate, and distinguish practice feedback from assessment evidence. Build demonstrations from approved workspace capabilities and use the future SKEIN Score Learning-mode interface for notation assessments. The curriculum can declare the exercise policy, starter score and assessor. SKEIN Score owns editing and enforcement of score restrictions.

Maintain an academic bibliography with a stable reference key, author or institution, title, edition or version, publication date where available, a URL or identifier, and a chapter, section or page locator where relevant. Link lesson claims and adapted examples to those entries. Each redistributed resource and third-party asset needs its own provenance, author or rights holder, attribution, applicable licence and permission record where relevant. Record modifications and preserve required notices. A benchmark citation is distinct from permission to distribute the cited materials.

## Packs and module boundaries

A future `.skeinpack` contract will carry versioned curriculum definitions and references to included or already installed resources. The Content Engine will validate schemas, unique IDs, ordering, prerequisite cycles, assessment rule parameters and references before applying an import. Required dependencies must resolve to compatible resources before a curriculum can be activated. Imported definitions select supported renderers and assessment behaviours and remain inert data. They cannot supply executable scripts, create accounts, grant access or mint completion records.

The Content Manager will preview and manage curriculum releases through repository contracts. React workspaces will render the validated hierarchy and order supplied by the engine. The Learning Engine will evaluate progression from recorded evidence. Future remote repositories will continue to enforce ownership, visibility and access policies, including access to restricted answer sheets and model answers. Curriculum definitions and learner progress remain separate. The existing Phase 03A library format continues to support resource packs.

## Educational benchmarks and bibliography

These sources are educational benchmarks for scope, progression and teaching methods. Their inclusion implies no affiliation, endorsement, accreditation, qualification equivalence or permission to redistribute proprietary materials.

- Yale University Department of Music, *Yale College Programs of Study 2026–2027, Music*. Benchmark for progression from introductory study to intermediate and advanced theory and application. [Yale College catalogue](https://catalog.yale.edu/ycps/subjects-of-instruction/music/)
- University of Edinburgh, *Fundamentals of Music Theory*. Benchmark for introducing Western notation, rhythm, pitch and harmony alongside informed listening and analysis. [University of Edinburgh course outline](https://www.shortcourses.ed.ac.uk/course/fundamentals-of-music-theory)
- Jason Allen, credited as J. Anthony Allen, *Music Theory Comprehensive Complete! (Parts 1, 2, & 3)*. Benchmark for a self-paced sequence that connects notation and keyboard work to melody, harmony and songwriting applications. [Published Udemy curriculum](https://www.udemy.com/course/music-theory-complete/)
- ABRSM, *Music Theory syllabus, Grades 1 to 8*. Benchmark for cumulative topic coverage and progressively more demanding written tasks. [ABRSM syllabus and qualification downloads](https://www.abrsm.org/en-gb/music-theory/about-music-theory)
- Mark Gotham, Kyle Gullings, Chelsey Hamm, Bryn Hughes, Brian Jarvis, Megan Lavengood and John Peterson, *Open Music Theory*, version 2. Benchmark for undergraduate scope, multimedia explanations and workbook practice. Check the licence of each asset before reuse. [Open Music Theory, version 2](https://viva.pressbooks.pub/openmusictheory/about/)
