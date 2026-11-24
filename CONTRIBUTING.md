# Contributing to DocsLit

Thanks for your interest in contributing to DocsLit. Contributions to the CLI,
documentation, web components, importer, and tests are welcome.

## Before you start

- Use Node.js 22.22.0 or later.
- Check the open issues and pull requests before starting unrelated work.
- Keep changes focused and add or update tests for behavior that changes.
- Do not include secrets, credentials, or private project data in commits or
  test fixtures.

## Set up the project

```bash
git clone https://github.com/UmbrellaDocs/docslit-cli.git
cd docslit-cli
npm install
```

## Run the tests

Run the complete test suite:

```bash
npm test
```

Run a focused test by name:

```bash
npx vitest run --reporter=verbose -t "testName"
```

DocsLit runs directly as ESM and has no separate compile step.

## Try the CLI locally

Use the CLI entry point from the repository:

```bash
node bin/docslit.js --help
node bin/docslit.js init ./test-docs
cd test-docs
node ../bin/docslit.js dev
```

## Making changes

- Follow the existing module, naming, and test patterns.
- Update directly related documentation and schemas.
- Add focused regression tests in the existing `*.test.js` or `*.test.ts`
  files rather than creating an unrelated test structure.
- Keep error messages actionable and include stable validation codes where
  the existing validator provides them.
- Reuse bundled assets and existing helpers instead of adding runtime network
  dependencies.

The CLI entry point is [bin/docslit.js](bin/docslit.js). Commands live in
[src/](src/), and the built-in web components are in [src/components/](src/components/).

## Pull requests

Before opening a pull request:

1. Run `npm test`.
2. Review `git diff` and remove unrelated changes.
3. Describe the problem, implementation, and verification performed.
4. Include screenshots or a short recording for visual changes.
5. Update [CHANGELOG.md](CHANGELOG.md) when the change is notable to users.

Pull requests that fix bugs should include a test that reproduces the issue
when practical. Documentation-only changes do not need test runs unless they
affect generated documentation or scripts.

## Reporting issues

Include the following when reporting a bug:

- DocsLit version
- Node.js version
- Operating system
- Command or configuration used
- Expected behavior
- Actual behavior
- Relevant logs or a minimal reproduction
