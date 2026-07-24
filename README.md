# goldbarth.dev

[![Deploy](https://github.com/goldbarth/goldbarth-dev/actions/workflows/azure-static-web-apps-proud-pond-0cece8c03.yml/badge.svg)](https://goldbarth.dev)
![Azure](https://img.shields.io/badge/Azure-0078D4?logo=microsoftazure&logoColor=fff)

**[goldbarth.dev](https://goldbarth.dev)** - field notes on LLM systems in .NET and Python.

Posts go up while the experiment is still running. They carry a status, and they change when the result does.
Projects live on the [GitHub profile](https://github.com/goldbarth), not here.

## Structure

Two objects, not categories:

- **Experiments** (`/experiments/<slug>`) - the unit of work: a framing question, a state, a dated log
- **Entries** (`/log/<slug>`) - the publication: a date, a body, its own URL. May belong to an experiment or stand alone as a note

Three states hang on the experiment and never on the entry: `running`, `partial answer`, `concluded`.
Every change is logged with a date and nothing is overwritten; states not yet reached read `open`.

Writing guide: [`docs/authoring.md`](./docs/authoring.md).

## License

| What                                | License                          |
|-------------------------------------|----------------------------------|
| Code (components, config, scripts)  | [MIT](./LICENSE)                 |
| Content (`src/content/`, `public/`) | [CC BY 4.0](./LICENSE-CC-BY-4.0) |