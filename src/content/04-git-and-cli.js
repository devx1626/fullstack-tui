import { T } from '../core/grade.js';

/**
 * These challenges are unusual: your script is executed for real in a
 * throwaway git repository, and the checks inspect the resulting history,
 * branches, staging area and files. `git`, `mkdir`, `touch`, `echo > file`,
 * `cd`, `ls`, `cat` and `rm` are supported; anything else is skipped.
 */
export default {
  id: 'git',
  title: 'Git & the Shell',
  badge: 'GT',
  color: 'good',
  tagline: 'Version control and the terminal - the professional baseline',
  hours: 6,
  why:
    'Git is not a filing system, it is a time machine and a collaboration protocol. Everything else in this curriculum assumes you can commit, ' +
    'branch and recover. Employers assume it on day one, and it is the tool that turns "I broke it" into "let me check what changed".',
  source: {
    course: 'Dave Gray - Git and GitHub for Beginners',
    url: 'https://www.youtube.com/watch?v=RGOj5yH7evk',
    roadmap: 'https://roadmap.sh/git-github',
    docs: 'https://git-scm.com/book/en/v2',
  },
  lessons: [
    // ---------------------------------------------------------------------
    {
      id: 'git-01',
      title: 'The Command Line You Actually Need',
      minutes: 20,
      objectives: [
        'Move around, create files and inspect them without a GUI',
        'Understand what the working directory means',
        'Read a path and know where it resolves',
      ],
      sections: [
        {
          heading: 'Eight commands cover daily work',
          body:
            '- `pwd` - where am I?\n' +
            '- `ls` / `ls -a` - what is here (including dotfiles)?\n' +
            '- `cd path` - go somewhere (`cd -` goes back, `cd ..` goes up)\n' +
            '- `mkdir -p a/b/c` - make folders, creating parents as needed\n' +
            '- `touch file` - create an empty file\n' +
            '- `cat file` - print a file\n' +
            '- `rm file` / `rm -r folder` - delete (there is no undo, and no trash)\n' +
            '- `echo "text" > file` - write; `>>` appends\n\n' +
            'The `-p` flag on `mkdir` is the one people miss. Without it, `mkdir notes/day1` fails when `notes/` does not exist yet.',
        },
        {
          heading: 'Paths: three kinds',
          body:
            '- `notes/day1.md` - relative to where you are now\n' +
            '- `/home/dev/notes` - absolute, from the root of the filesystem\n' +
            '- `~/notes` - absolute, from your home directory (~ is a shell shorthand)\n' +
            '- `../css/styles.css` - up one, then down\n\n' +
            'Relative paths are why `cd` matters: the same command means different things in different directories, and that is the source of most ' +
            '"it works on my machine" confusion.',
        },
        {
          heading: 'Two habits that prevent disasters',
          body:
            '1. **`ls` before `rm -r`.** Always. Look at what you are about to delete.\n' +
            '2. **`git status` before and after anything destructive.** If it is committed, it is recoverable.\n\n' +
            'Also worth knowing: Tab autocompletes paths (use it constantly), Up recalls the last command, and Ctrl+R searches your history. ' +
            'Those three shortcuts will save you more time than any editor plugin.',
        },
        {
          heading: 'Sample code: setting up a project',
          body: 'A realistic first five minutes in a terminal.',
          code: {
            lang: 'sh',
            caption: 'setup.sh',
            source: `# Where am I, and what is here?
pwd
ls -a

# Make the project skeleton in one go
mkdir -p portfolio/css portfolio/js portfolio/images

# Create the files
touch portfolio/index.html portfolio/css/styles.css portfolio/js/main.js

# Write a first line into a file
echo "# Dev's portfolio" > portfolio/README.md

# Check the result
ls portfolio
cat portfolio/README.md`,
          },
        },
      ],
      pitfalls: [
        '`rm -r` on the wrong directory, with no trash to recover from',
        '`mkdir notes/day1` failing because `notes/` does not exist (use `-p`)',
        '`>` when you meant `>>`, silently destroying the file you were adding to',
        'Assuming you are in the directory you think you are (run `pwd`)',
      ],
      keyPoints: [
        '`pwd`, `ls`, `cd`, `mkdir -p`, `touch`, `cat`, `rm`, `echo >`',
        '`-p` makes parent directories; Tab completes paths',
        'Relative paths depend on where you are; `ls` before `rm`',
      ],
      resources: [
        { label: 'MDN: Command line crash course', url: 'https://developer.mozilla.org/en-US/docs/Learn/Tools_and_testing/Understanding_client-side_tools/Command_line' },
        { label: 'Git cheat sheet (PDF)', url: 'https://education.github.com/git-cheat-sheet-education.pdf' },
      ],
      challenges: [
        {
          id: 'fix-setup-script',
          kind: 'debug',
          difficulty: 'easy',
          minutes: 8,
          lang: 'sh',
          prompt:
            'This setup script is supposed to build a project skeleton but it fails in four ways: a missing parent directory, a file written to ' +
            'the wrong place, an accidental overwrite, and a path that escapes the project. Your script is executed for real, so the checks can ' +
            'see exactly what ended up on disk.',
          requirements: [
            'The directory tree `site/src` and `site/assets` exists',
            '`site/index.html` and `site/src/app.js` both exist and are empty',
            '`site/README.md` contains the line `# Site`',
            '`site/CHANGELOG.md` keeps both lines, with `v2` appended after `v1`',
            'Nothing is created outside `site/`',
          ],
          starter: `mkdir site/src
mkdir site/assets
touch site/index.html
touch src/app.js
echo "# Site" > site/README.md
echo "v1" > site/CHANGELOG.md
echo "v2" > site/CHANGELOG.md
touch ../escaped.txt`,
          hints: [
            '`mkdir site/src` fails if `site` does not exist yet. `-p` creates intermediate directories.',
            '`touch src/app.js` writes to the current directory, not inside `site`.',
            '`>` truncates. You want the append operator.',
            'Relative paths can climb out of your project with `..` - do not.',
          ],
          solution: `mkdir -p site/src site/assets
touch site/index.html site/src/app.js
echo "# Site" > site/README.md
echo "v1" > site/CHANGELOG.md
echo "v2" >> site/CHANGELOG.md`,
          checks: [
            T.git('the directory tree exists', (r) => (r.exists('site/src') && r.exists('site/assets')) || 'both `site/src` and `site/assets` must exist'),
            T.git('both source files exist', (r) => (r.exists('site/index.html') && r.exists('site/src/app.js')) || 'create site/index.html and site/src/app.js'),
            T.git('the javascript file is in the right place', (r) => !r.exists('src/app.js') || '`src/app.js` was created outside `site/` - remove it'),
            T.git('the README has the expected content', (r) => (r.read('site/README.md') || '').includes('# Site') || 'site/README.md should contain "# Site"'),
            T.git('the changelog kept both lines', (r) => {
              const body = r.read('site/CHANGELOG.md') || '';
              return (body.includes('v1') && body.includes('v2')) || 'use `>>` so v1 is not overwritten';
            }),
            T.git('nothing escaped the project', (r) => r.escapes().length === 0 || `do not write outside your working directory (blocked: ${r.escapes().map((e) => e.command).join(', ')})`),
          ],
        },
        {
          id: 'write-skeleton',
          kind: 'write',
          difficulty: 'easy',
          minutes: 8,
          lang: 'sh',
          prompt:
            'Write the commands to scaffold a Node project by hand: folders, files, a README with content, and a `.gitignore` that ignores ' +
            '`node_modules` and `.env`. No `npm init`, just the commands you would type.',
          requirements: [
            'Folders: `app`, `app/routes`, `app/db`, `tests`',
            'Files: `app/index.js`, `app/db/client.js`, `tests/index.test.js`, `package.json`, `README.md`',
            '`README.md` contains the line `# My API`',
            '`.gitignore` exists and mentions `node_modules` and `.env`',
          ],
          starter: ``,
          hints: [
            '`mkdir -p` can take several paths at once.',
            '`touch` also accepts several paths.',
            'Use `echo` with a redirect for file contents, and `>>` to add more lines.',
          ],
          solution: `mkdir -p app/routes app/db tests
touch app/index.js app/db/client.js tests/index.test.js package.json README.md
echo "# My API" > README.md
echo "node_modules/" > .gitignore
echo ".env" >> .gitignore`,
          checks: [
            T.git('all folders exist', (r) => ['app', 'app/routes', 'app/db', 'tests'].every((d) => r.exists(d)) || 'one of the four folders is missing'),
            T.git('all files exist', (r) => ['app/index.js', 'app/db/client.js', 'tests/index.test.js', 'package.json', 'README.md'].every((f) => r.exists(f)) || 'one of the five files is missing'),
            T.git('the README has the heading', (r) => (r.read('README.md') || '').includes('# My API') || 'README.md needs the line "# My API"'),
            T.git('.gitignore ignores node_modules', (r) => /node_modules/.test(r.read('.gitignore') || '') || 'add node_modules to .gitignore'),
            T.git('.gitignore ignores .env', (r) => /^\.env$/m.test(r.read('.gitignore') || '') || 'add a line containing exactly .env'),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'git-02',
      title: 'Commits: the Three Trees',
      minutes: 30,
      objectives: [
        'Explain working directory, staging area and repository',
        'Stage deliberately rather than with `git add .`',
        'Write a commit message a reviewer can act on',
      ],
      sections: [
        {
          heading: 'Three trees, one workflow',
          body:
            '1. **Working directory** - the files you are editing\n' +
            '2. **Staging area (index)** - what you have chosen for the next commit\n' +
            '3. **Repository (HEAD)** - the committed history\n\n' +
            '`git add` moves changes from 1 to 2. `git commit` moves them from 2 to 3. `git status` shows the differences between all three, which ' +
            'is why it is the command you run constantly.',
        },
        {
          heading: 'Stage what you mean',
          body:
            '- `git add file.js` - one file\n' +
            '- `git add src/` - a directory\n' +
            '- `git add -p` - **hunk by hunk**, and the best habit in this module: it forces you to read your own changes before committing\n' +
            '- `git add .` - everything, including the `console.log` you forgot and the `.env` you must never commit\n\n' +
            'A commit should be one coherent change. If your message needs the word "and", you probably wanted two commits.',
        },
        {
          heading: 'Messages that help future-you',
          body:
            'Format: `type: imperative summary` (under 72 characters), then a blank line, then *why*.\n\n' +
            '```\nfeat: add project filter to the projects page\n\nFiltering happens client-side over a cached array so typing stays\ninstant. The API call moves into loadProjects() for reuse by the\nsearch field.\n```\n\n' +
            'The summary says what changed. The body says why, and what you considered. `git log --oneline` should read like a changelog.',
        },
        {
          heading: 'Sample code: a clean first three commits',
          body: 'Run these in order and look at `git log --oneline` afterwards. Each commit does exactly one thing.',
          code: {
            lang: 'sh',
            caption: 'commits.sh',
            source: `git init -b main

# Commit 1: the skeleton
echo "# Portfolio" > README.md
mkdir -p css
touch index.html css/styles.css
git add README.md index.html css/styles.css
git commit -m "chore: scaffold the project skeleton"

# Commit 2: the first real feature
echo "body { margin: 0; }" > css/styles.css
git add css/styles.css
git commit -m "feat: add the base reset stylesheet"

# Commit 3: documentation, on its own
echo "## Running locally" >> README.md
git add -p
git commit -m "docs: document how to run the site locally"

git log --oneline`,
          },
        },
      ],
      pitfalls: [
        '`git add .` and accidentally staging `.env`, `node_modules` or a 40MB video',
        'Committing a change you have not read (`git diff --staged` first)',
        'Message: "fixed stuff" - useless in three months, even to you',
        'One giant commit at the end of the day, so nothing can be reverted independently',
        'Committing to `main` directly on a shared repository',
      ],
      keyPoints: [
        'Working directory -> staging -> repository',
        '`git add -p` to stage hunks, `git diff --staged` before committing',
        'One coherent change per commit; `type: summary` messages',
        '`git status` tells you which of the three trees you are looking at',
      ],
      resources: [
        { label: 'Conventional Commits', url: 'https://www.conventionalcommits.org/en/v1.0.0/' },
        { label: 'Git book: Recording changes', url: 'https://git-scm.com/book/en/v2/Git-Basics-Recording-Changes-to-the-Repository' },
      ],
      challenges: [
        {
          id: 'fix-commits',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 12,
          lang: 'sh',
          prompt:
            'This script is supposed to produce three tidy commits. It produces one, it commits a secret, and it never reads what it staged. ' +
            'Your commands really run, so the checks inspect the actual commit history.',
          requirements: [
            'Exactly three commits, in this order: scaffold, feature, docs',
            '`.env` is never committed (add it to `.gitignore` and do not stage it)',
            '`css/styles.css` changes land in the feature commit, not the scaffold commit',
            '`app.js` is committed (it was created but forgotten)',
            'Every commit message is at least 10 characters and starts with a type (`feat:`, `fix:`, `docs:`, `chore:`)',
          ],
          starter: `git init -b main
echo "SECRET=abc123" > .env
echo "# Project" > README.md
touch index.html onapp.js
mkdir -p css
echo "body {}" > css/styles.css
git add .
git commit -m "stuff"`,
          files: { 'package.json': '{\n  "name": "demo"\n}\n' },
          hints: [
            '`git add .` stages `.env` too. Add a `.gitignore` first, and stage files by name.',
            'The file is called `onapp.js` in the script, but the requirement says `app.js`. Fix the name.',
            'Three commits means three separate `git add` + `git commit` pairs.',
            'A good message: `chore: scaffold the project skeleton`.',
          ],
          solution: `git init -b main
echo "SECRET=abc123" > .env
echo "node_modules/" > .gitignore
echo ".env" >> .gitignore
echo "# Project" > README.md
touch index.html app.js
mkdir -p css

git add README.md index.html app.js .gitignore
git commit -m "chore: scaffold the project skeleton"

echo "body {}" > css/styles.css
git add css/styles.css
git commit -m "feat: add the base stylesheet"

echo "## Running locally" >> README.md
git add README.md
git commit -m "docs: document how to run the project"`,
          checks: [
            T.git('three commits exist', (r) => r.commitCount() === 3 || `found ${r.commitCount()} commit(s), expected 3`),
            T.git('the .env file was never committed', (r) => !r.lastCommitFiles().includes('.env') && !r.log().some((c) => c.subject.includes('.env')) || 'never commit secrets'),
            T.git('.env is ignored', (r) => {
              const status = r.status();
              return !status.untracked.includes('.env') || 'add .env to .gitignore so it stops showing as untracked';
            }),
            T.git('the stylesheet went into its own commit', (r) => {
              const log = r.log();
              if (log.length < 2) return 'not enough commits yet';
              const files = r.run('git show --name-only --pretty=format: HEAD~1');
              return (files.stdout || '').includes('css/styles.css') || 'the stylesheet should land in the second commit';
            }),
            T.git('app.js is tracked', (r) => {
              const tracked = r.run('git ls-files');
              return (tracked.stdout || '').includes('app.js') || 'app.js was created but never staged';
            }),
            T.git('every message has a type prefix', (r) => {
              const bad = r.log().filter((c) => !/^(feat|fix|docs|chore|refactor|test|style|perf|build|ci)(\(.+\))?:\s/.test(c.subject));
              return bad.length === 0 || `unconventional message(s): ${bad.map((b) => b.subject).join(' | ')}`;
            }),
            T.git('the scaffold commit is the oldest', (r) => {
              const log = r.log();
              if (log.length < 3) return 'need three commits';
              const oldest = log[log.length - 1];
              return /scaffold|skeleton|setup/i.test(oldest.subject) || `the first commit is "${oldest.subject}"`;
            }),
            T.git('the newest commit is the documentation change', (r) => {
              const log = r.log();
              if (!log.length) return 'no commits';
              return /^(docs|chore|feat|fix)(\(.+\))?:\s/.test(log[0].subject) && /doc|readme/i.test(log[0].subject) || `the last commit should be the docs change, not "${log[0].subject}"`;
            }),
          ],
        },
        {
          id: 'write-history',
          kind: 'write',
          difficulty: 'medium',
          minutes: 15,
          lang: 'sh',
          prompt:
            'Build a realistic four-commit history for a small API project. The checks replay your script and inspect the log, so the order and ' +
            'the contents of each commit both matter.',
          requirements: [
            'Initialise the repo with a `main` branch',
            'Commit 1 `chore:` - scaffold (`package.json`, `.gitignore`, `README.md`)',
            'Commit 2 `feat:` - `src/server.js` and `src/routes/users.js`',
            'Commit 3 `fix:` - change exactly one file (`src/routes/users.js`)',
            'Commit 4 `test:` - add `tests/users.test.js`',
            '`.gitignore` covers `node_modules` and `.env`, and `node_modules/` is never committed even though it exists',
            'Exactly one commit touches `src/server.js`',
          ],
          starter: ``,
          files: {
            'package.json': '{\n  "name": "api",\n  "type": "module"\n}\n',
          },
          hints: [
            'Stage named files rather than `.`, so the checks on which commit touched what stay true.',
            'Create `node_modules/` and a file inside it to prove your `.gitignore` works.',
            'Small, focused `git add` + `git commit` pairs keep each commit to one idea.',
          ],
          solution: `git init -b main
echo "node_modules/" > .gitignore
echo ".env" >> .gitignore
echo "# API" > README.md
mkdir -p node_modules

git add package.json .gitignore README.md
git commit -m "chore: scaffold the api project"

mkdir -p src/routes tests
echo "import './routes/users.js';" > src/server.js
echo "export function listUsers() { return []; }" > src/routes/users.js
git add src/server.js src/routes/users.js
git commit -m "feat: add the server entrypoint and users route"

echo "export function listUsers() { return ['ama']; }" > src/routes/users.js
git add src/routes/users.js
git commit -m "fix: return the seeded users from listUsers"

echo "test('lists users', () => {});" > tests/users.test.js
git add tests/users.test.js
git commit -m "test: cover the users route"`,
          checks: [
            T.git('four commits with the right types', (r) => {
              const log = r.log();
              if (log.length !== 4) return `found ${log.length} commits, expected 4`;
              const types = log.slice().reverse().map((c) => (c.subject.match(/^(\w+)/) || [, ''])[1]);
              const want = ['chore', 'feat', 'fix', 'test'];
              const mismatch = want.findIndex((w, i) => types[i] !== w);
              return mismatch === -1 || `commit ${mismatch + 1} is "${types[mismatch]}", expected "${want[mismatch]}"`;
            }),
            T.git('the branch is main', (r) => r.branches().current === 'main' || `currently on "${r.branches().current}"`),
            T.git('node_modules is not tracked', (r) => {
              const tracked = r.run('git ls-files');
              return !(tracked.stdout || '').includes('node_modules') || 'node_modules must never be committed';
            }),
            T.git('.gitignore covers node_modules and .env', (r) => {
              const body = r.read('.gitignore') || '';
              const problems = [];
              if (!/node_modules/.test(body)) problems.push('node_modules');
              if (!/\.env/.test(body)) problems.push('.env');
              return problems.length === 0 || `missing from .gitignore: ${problems.join(', ')}`;
            }),
            T.git('server.js is touched by exactly one commit', (r) => {
              const count = r.log().filter((c) => {
                const files = r.run(`git show --name-only --pretty=format: ${c.hash}`);
                return (files.stdout || '').includes('src/server.js');
              }).length;
              return count === 1 || `src/server.js appears in ${count} commits`;
            }),
            T.git('the fix commit changes exactly one file', (r) => {
              const log = r.log();
              const fix = log.slice().reverse().find((c) => c.subject.startsWith('fix'));
              if (!fix) return 'no fix commit found';
              const files = (r.run(`git show --name-only --pretty=format: ${fix.hash}`).stdout || '').split('\n').filter(Boolean);
              return files.length === 1 || `the fix commit changed ${files.length} files`;
            }),
            T.git('the test commit only adds tests', (r) => {
              const log = r.log();
              const test = log.slice().reverse().find((c) => c.subject.startsWith('test'));
              if (!test) return 'no test commit found';
              const files = (r.run(`git show --name-only --pretty=format: ${test.hash}`).stdout || '').split('\n').filter(Boolean);
              return files.length === 1 && files[0].includes('tests/') || `the test commit touched: ${files.join(', ')}`;
            }),
            T.git('the working tree is clean', (r) => {
              const s = r.status();
              const dirty = s.staged.length + s.unstaged.length + s.untracked.filter((f) => !f.includes('node_modules')).length;
              return dirty === 0 || `${dirty} file(s) are still uncommitted`;
            }),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'git-03',
      title: 'Branches and Merges',
      minutes: 30,
      objectives: [
        'Use a branch for every change, no matter how small',
        'Merge without fear, and resolve a conflict deliberately',
        'Know when to rebase and when not to',
      ],
      sections: [
        {
          heading: 'A branch is a movable label',
          body:
            'Creating a branch does not copy your files. It writes a 40-byte pointer to a commit. That is why branching is instant and cheap, and ' +
            'why you should do it for everything.\n\n' +
            '```\ngit switch -c feat/search      # create and move (modern)\ngit switch main                # move back\n```\n\n' +
            '`git checkout` still works and you will see it everywhere, but `git switch` (branches) and `git restore` (files) split its two jobs ' +
            'and are much harder to misuse.',
        },
        {
          heading: 'Merging, and what a conflict actually is',
          body:
            '`git merge feat/search` from `main` brings the branch in. If both branches changed the same lines of the same file since they ' +
            'diverged, git cannot choose and asks you. Conflict markers look like this:\n\n' +
            '```\n<<<<<<< HEAD\nconst limit = 10;\n=======\nconst limit = 25;\n>>>>>>> feat/search\n```\n\n' +
            'Resolving is: delete the markers, leave the code you want (which may be neither side), `git add` the file, `git commit`. **A conflict ' +
            'is not an error.** It is git refusing to guess.',
        },
        {
          heading: 'Fast-forward, merge commit, rebase',
          body:
            '- **Fast-forward** - `main` had no new commits, so the label just moves. Linear history, no merge commit.\n' +
            '- **Merge commit** - both sides moved. Git creates a commit with two parents. Honest history.\n' +
            '- **Rebase** - replays your commits on top of the other branch. Linear, tidy, and **rewrites commit hashes**.\n\n' +
            'The safe rule: **rebase your own unpushed branch, never a shared one.** Rebasing something someone else has pulled forces them to ' +
            'untangle their history.',
        },
        {
          heading: 'Sample code: a feature branch end to end',
          body: 'This is the loop you will run dozens of times a week.',
          code: {
            lang: 'sh',
            caption: 'branch-workflow.sh',
            source: `git switch -c feat/search        # 1. branch off main

# ... make changes ...
git add src/search.js
git commit -m "feat: add client-side search"

git switch main                   # 2. go back
git pull                          # 3. get anything new (real repos)
git merge feat/search             # 4. bring the work in

git branch -d feat/search         # 5. delete the merged branch

# If someone else changed the same lines, you will get a conflict:
#   edit the files -> git add <files> -> git commit`,
          },
        },
      ],
      pitfalls: [
        'Doing long-lived work on `main` where it cannot be reviewed',
        'Rebasing a branch that has been pushed and pulled by someone else',
        'Resolving a conflict by deleting the other person\'s code without asking',
        'Leaving 40 stale local branches around',
        'Merging with a dirty working directory, then not understanding the result',
      ],
      keyPoints: [
        'Branches are cheap pointers - branch for every change',
        '`git switch -c` to create, `git merge` to integrate',
        'Conflicts are git asking a question, not an error',
        'Rebase your own unpushed branches only',
      ],
      resources: [
        { label: 'Git book: Branching', url: 'https://git-scm.com/book/en/v2/Git-Branching-Branches-in-a-Nutshell' },
        { label: 'Oh Shit, Git!?!', url: 'https://ohshitgit.com/' },
      ],
      challenges: [
        {
          id: 'fix-branching',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 12,
          lang: 'sh',
          prompt:
            'This script wanted to add a feature on a branch and merge it back. Instead it committed straight to `main`, created the branch ' +
            'after the fact, and then could not delete it. Your commands are executed for real - the checks look at the actual branch graph.',
          requirements: [
            '`main` contains exactly two commits: the scaffold and the merged feature',
            'The feature work happened on a branch called `feat/greeting`',
            'The branch is merged into `main` and then deleted',
            'No stray local branches remain',
            '`src/app.js` contains a `greet` export on `main`',
          ],
          starter: `git init -b main
echo "# App" > README.md
git add README.md
git commit -m "chore: initial commit"

echo "export const greet = () => 'hi';" > src-app.js
git add src-app.js
git commit -m "greeting"

git branch feat/greeting
git switch main
git branch -d feat/greeting`,
          hints: [
            'Commit the feature on the branch, not on `main`: `git switch -c feat/greeting` **before** you edit.',
            '`git branch -d` refuses to delete an unmerged branch. Merge first, then delete.',
            'A plain `git merge` fast-forwards, so `main` gains the feature commit without an extra merge commit - `--no-ff` would make it three.',
            'The requirement names `src/app.js`; the starter writes `src-app.js`.',
          ],
          solution: `git init -b main
echo "# App" > README.md
git add README.md
git commit -m "chore: initial commit"

git switch -c feat/greeting
mkdir -p src
echo "export const greet = () => 'hi';" > src/app.js
git add src/app.js
git commit -m "feat: add a greet helper"

git switch main
git merge feat/greeting
git branch -d feat/greeting`,
          checks: [
            T.git('main has exactly two commits', (r) => {
              const out = r.run('git rev-list --count main');
              const n = Number(out.stdout);
              return n === 2 || `main has ${n} commits, expected 2`;
            }),
            T.git('the feature branch existed and was contained in main', (r) => {
              const merged = r.run('git branch -a --merged main');
              return /feat\/greeting/.test(merged.stdout || '') || r.branches().current === 'main' || 'feat/greeting should be merged into main';
            }),
            T.git('the stray branch was cleaned up', (r) => {
              const list = r.branches().all;
              return list.length <= 1 || `branches still present: ${list.join(', ')}`;
            }),
            T.git('we are back on main', (r) => r.branches().current === 'main' || `currently on ${r.branches().current}`),
            T.git('the greet helper is on main', (r) => /greet/.test(r.read('src/app.js') || '') || 'src/app.js should export greet'),
            T.git('the feature is a real commit, not a stray file', (r) => {
              const tracked = r.run('git ls-files');
              return (tracked.stdout || '').includes('src/app.js') || 'src/app.js is not tracked by git';
            }),
            T.git('main is up to date with its own work', (r) => {
              const s = r.status();
              return s.staged.length === 0 && s.unstaged.length === 0 || 'commit or discard your remaining changes';
            }),
          ],
        },
        {
          id: 'write-branch-merge',
          kind: 'write',
          difficulty: 'hard',
          minutes: 18,
          lang: 'sh',
          prompt:
            'Simulate a realistic two-branch workflow with a conflict. You cannot run an interactive merge here, so resolve it the way you would ' +
            'in an editor: write the final file content, stage it, and commit.',
          requirements: [
            '`main` has an initial commit with `config.js` containing `const LIMIT = 10;`',
            'A branch `feat/limit` changes that line to `const LIMIT = 25;`',
            'A branch `fix/zero` (created from main) adds a line `const START = 0;` to the same file',
            'Merge `feat/limit` into `main` first (fast-forward is fine)',
            'Merge `fix/zero` into `main` second, resolving the conflict so the file contains **both** `LIMIT = 25` and `START = 0`',
            'Both side branches are deleted afterwards and only `main` remains',
          ],
          starter: ``,
          hints: [
            'Write the resolved file with `echo` lines, then `git add` and `git commit` to complete the merge.',
            'If `git merge` stops with a conflict, our runner keeps going - your next lines should finish the merge by committing.',
            'Deleting an unmerged branch needs `-D`, but a properly resolved and committed merge allows `-d`.',
          ],
          solution: `git init -b main
echo "const LIMIT = 10;" > config.js
git add config.js
git commit -m "chore: add the initial config"

git switch -c feat/limit
echo "const LIMIT = 25;" > config.js
git add config.js
git commit -m "feat: raise the page limit to 25"

git switch main
git merge --no-ff feat/limit -m "merge: raise the page limit"

git switch -c fix/zero main
git switch main
git switch fix/zero
echo "const LIMIT = 10;" > config.js
echo "const START = 0;" >> config.js
git add config.js
git commit -m "fix: start pagination at zero"

git switch main
git merge fix/zero -m "merge: start pagination at zero"

echo "const LIMIT = 25;" > config.js
echo "const START = 0;" >> config.js
git add config.js
git commit -m "merge: keep both changes to config"

git branch -d feat/limit
git branch -d fix/zero`,
          checks: [
            T.git('we end on main', (r) => r.branches().current === 'main' || `on ${r.branches().current}`),
            T.git('only main remains', (r) => r.branches().all.length === 1 || `still have: ${r.branches().all.join(', ')}`),
            T.git('the resolved file keeps the raised limit', (r) => /LIMIT\s*=\s*25/.test(r.read('config.js') || '') || 'config.js should contain LIMIT = 25'),
            T.git('the resolved file keeps the new constant', (r) => /START\s*=\s*0/.test(r.read('config.js') || '') || 'config.js should contain START = 0'),
            T.git('no conflict markers survive', (r) => {
              const body = r.read('config.js') || '';
              return !body.includes('<<<<<<<') && !body.includes('>>>>>>>') || 'delete the conflict markers';
            }),
            T.git('the history contains a merge', (r) => {
              const out = r.run('git log --merges --oneline');
              return (out.stdout || '').trim().length > 0 || 'use `git merge` so the branch content is integrated';
            }),
            T.git('at least four commits landed on main', (r) => r.commitCount() >= 4 || `only ${r.commitCount()} commits on main`),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'git-04',
      title: 'Remotes, Undoing and .gitignore',
      minutes: 25,
      objectives: [
        'Push, pull and understand what tracking a branch means',
        'Recover from the four mistakes everyone makes',
        'Write a .gitignore that actually keeps secrets out',
      ],
      sections: [
        {
          heading: 'Remotes',
          body:
            '```\ngit remote add origin git@github.com:you/repo.git\ngit push -u origin main      # -u sets the upstream, once\ngit push                     # afterwards this is enough\ngit pull --rebase            # get changes without a merge commit\n```\n\n' +
            '`-u` links your local `main` to `origin/main`, which is why later pushes and pulls need no arguments. `git fetch` downloads without ' +
            'changing your files; `git pull` is fetch plus merge. When you want to see what is coming before integrating it, fetch first.',
        },
        {
          heading: 'Undoing, without panic',
          body:
            '| Situation | Command |\n' +
            '|---|---|\n' +
            '| Uncommitted file change, want it gone | `git restore file.js` |\n' +
            '| Staged but not committed | `git restore --staged file.js` |\n' +
            '| Wrong commit message, not pushed | `git commit --amend -m "better"` |\n' +
            '| Last commit is wrong, not pushed, keep the changes | `git reset --soft HEAD~1` |\n' +
            '| Committed a secret that was never pushed | `git reset --soft HEAD~1`, add to `.gitignore`, re-commit |\n' +
            '| Pushed, and you must take it back | `git revert <hash>` - a **new** commit that undoes it |\n' +
            '| Lost a branch you deleted | `git reflog` - then `git switch -c rescued <hash>` |\n\n' +
            'The golden rule: anything committed is recoverable for weeks via `reflog`. Anything never committed is gone. That asymmetry is the ' +
            'entire argument for committing often.',
        },
        {
          heading: 'A .gitignore that does its job',
          body:
            '```\nnode_modules/\ndist/\nbuild/\n.env\n.env.*\n!.env.example\n*.log\n.DS_Store\ncoverage/\n.vscode/\n.idea/\n```\n\n' +
            'Trailing slash = directory only. `!` re-includes something excluded by a broader rule - which is how you commit `.env.example` while ' +
            'ignoring every real `.env`.\n\n' +
            '**A .gitignore only affects untracked files.** If you already committed `node_modules`, adding it to `.gitignore` changes nothing - ' +
            'you must `git rm -r --cached node_modules` first.',
          code: {
            lang: 'sh',
            caption: 'committed a secret? do this',
            source: `echo ".env" >> .gitignore
git rm --cached .env
git commit -m "chore: stop tracking .env"

# If it was already pushed, treat the secret as compromised:
# rotate the key, then optionally clean history with git filter-repo.`,
          },
        },
        {
          heading: 'Sample code: the safe daily loop',
          body: 'Five commands, and you will rarely get into trouble.',
          code: {
            lang: 'sh',
            caption: 'daily.sh',
            source: `git switch -c feat/contact-page
git status                       # what am I about to touch?
git add -p                       # read every hunk before staging
git diff --staged                # final review
git commit -m "feat: add the contact form and validation"
git push -u origin feat/contact-page

# Then open a pull request, get it reviewed, and merge it there.
# Locally, afterwards:
git switch main
git pull --rebase
git branch -d feat/contact-page`,
          },
        },
      ],
      pitfalls: [
        'Committing an API key, then "fixing" it by just deleting the line in a new commit - the key is still in history',
        'Adding `node_modules` to `.gitignore` after it is already tracked (needs `git rm --cached`)',
        '`git reset --hard` on a shared branch, wiping other people\'s commits',
        'Force-pushing over a teammate\'s work',
        '`git pull` producing a merge commit you did not intend (use `--rebase`)',
      ],
      keyPoints: [
        '`push -u origin main` once, then plain `push`/`pull`',
        'Uncommitted work is unrecoverable; committed work is in `reflog`',
        '`revert` for pushed commits, `reset` only for local ones',
        '`.gitignore` does not untrack files - `git rm --cached` does',
      ],
      resources: [
        { label: 'GitHub: .gitignore templates', url: 'https://github.com/github/gitignore' },
        { label: 'Git book: Undoing things', url: 'https://git-scm.com/book/en/v2/Git-Basics-Undoing-Things' },
        { label: 'gitignore.io', url: 'https://www.toptal.com/developers/gitignore' },
      ],
      challenges: [
        {
          id: 'fix-secret-commit',
          kind: 'debug',
          difficulty: 'hard',
          minutes: 14,
          lang: 'sh',
          prompt:
            'A `.env` file with an API key was committed. The current "fix" deletes the file in a new commit, which leaves the key in history and ' +
            'loses local configuration. Do it properly: keep the file on disk, stop tracking it, and record the decision in `.gitignore`.',
          requirements: [
            'The `.env` file still exists on disk afterwards',
            '`.env` is not tracked by git and does not appear in `git ls-files`',
            '`.gitignore` contains `.env` and a `!.env.example` exception',
            '`.env.example` **is** tracked',
            '`node_modules/` is never tracked even though the directory exists',
            'The repository ends with no uncommitted changes',
          ],
          starter: `git init -b main
echo "API_KEY=supersecret" > .env
echo "node_modules/" > .gitignore
mkdir -p node_modules/lodash
touch node_modules/lodash/index.js
echo "# App" > README.md
git add .
git commit -m "initial commit"

git rm .env
git commit -m "remove env"`,
          hints: [
            '`git rm` deletes the file from disk too. `git rm --cached` stops tracking while keeping it.',
            'A `.gitignore` entry does not untrack an already-committed file.',
            '`echo "*.env"` then `!.env.example` - the `!` line must come after the broader rule.',
          ],
          solution: `git init -b main
echo "API_KEY=supersecret" > .env
echo ".env" > .gitignore
echo "!.env.example" >> .gitignore
echo "node_modules/" >> .gitignore
mkdir -p node_modules/lodash
touch node_modules/lodash/index.js
echo "API_KEY=" > .env.example
echo "# App" > README.md

git add README.md .gitignore .env.example
git commit -m "chore: scaffold the project"

echo "API_KEY=supersecret" > .env
git rm --cached .env > /dev/null 2>&1
git status`,
          checks: [
            T.git('the .env file still exists on disk', (r) => r.exists('.env') || '.env was deleted - use `git rm --cached` to keep it'),
            T.git('.env is no longer tracked', (r) => {
              const tracked = (r.run('git ls-files').stdout || '').split('\n');
              return !tracked.includes('.env') || '.env is still tracked by git';
            }),
            T.git('.gitignore ignores .env', (r) => /^\.env$/m.test(r.read('.gitignore') || '') || 'add a line containing exactly .env'),
            T.git('.gitignore re-includes .env.example', (r) => /^!\.env/m.test(r.read('.gitignore') || '') || 'add the line !.env.example'),
            T.git('.env.example is tracked', (r) => (r.run('git ls-files').stdout || '').includes('.env.example') || '.env.example should be committed as documentation'),
            T.git('node_modules is not tracked', (r) => !(r.run('git ls-files').stdout || '').includes('node_modules') || 'node_modules must never be tracked'),
            T.git('the history does not contain the secret', (r) => {
              const out = r.run('git log -p --all');
              return !(out.stdout || '').includes('supersecret') || 'the key is still in the commit history - never commit it in the first place';
            }),
            T.git('the working tree is clean', (r) => {
              const s = r.status();
              const dirty = s.staged.length + s.unstaged.length + s.untracked.length;
              return dirty === 0 || `${dirty} file(s) uncommitted: ${[...s.staged, ...s.unstaged, ...s.untracked].join(', ')}`;
            }),
            T.git('a remote can be configured', (r) => {
              r.run('git remote add origin https://github.com/learner/demo.git');
              return r.remotes().includes('origin') || 'could not add a remote';
            }),
            T.git('the branch is called main', (r) => r.branches().current === 'main' || `on ${r.branches().current}`),
          ],
        },
        {
          id: 'write-undo-recover',
          kind: 'write',
          difficulty: 'hard',
          minutes: 16,
          lang: 'sh',
          prompt:
            'Practise the recovery drills, because you will need them under pressure. Build a repository, commit, then undo three different ways ' +
            'and recover something you deleted. The checks inspect the final history and file state.',
          requirements: [
            'Three commits exist on `main`, and the first is still the scaffold',
            'The second commit was created, then undone with `git reset --soft HEAD~1` and re-committed with a better message',
            'A branch `experiment` was created, committed to, then deleted - and the commit exists nowhere in `main`',
            '`git reflog` can still see the deleted branch work (the checks look for it in the reflog)',
            '`notes.md` was deleted with `rm` and brought back with `git restore`, leaving it on disk and matching the committed version',
            '`.gitignore` covers `*.log` and a `debug.log` file exists on disk but is untracked',
          ],
          starter: ``,
          hints: [
            '`git reset --soft HEAD~1` un-commits but keeps your changes staged.',
            '`git reflog` records every place HEAD has been - that is how you rescue a deleted branch.',
            '`git restore notes.md` brings a deleted tracked file back from the index.',
          ],
          solution: `git init -b main
echo "# Notes" > notes.md
echo "node_modules/" > .gitignore
git add notes.md .gitignore
git commit -m "chore: scaffold the repository"

echo "Today I learned about rebase." >> notes.md
git add notes.md
git commit -m "temp"
git reset --soft HEAD~1
git commit -m "docs: record what I learned about rebase"

git switch -c experiment
echo "throwaway" > experiment.js
git add experiment.js
git commit -m "feat: something I later abandoned"
git switch main
git branch -D experiment

rm notes.md
git restore notes.md

echo "*.log" >> .gitignore
echo "noise" > debug.log
git add .gitignore
git commit -m "chore: ignore log files"`,
          checks: [
            T.git('three commits are on main', (r) => r.commitCount() === 3 || `main has ${r.commitCount()} commits, expected 3`),
            T.git('the scaffold is still the first commit', (r) => {
              const log = r.log();
              if (!log.length) return 'no commits';
              return /scaffold/i.test(log[log.length - 1].subject) || `the first commit is "${log[log.length - 1].subject}"`;
            }),
            T.git('the reworded commit replaced the placeholder', (r) => {
              const log = r.log();
              return !log.some((c) => c.subject === 'temp') || 'the "temp" commit should have been amended or reset and re-committed';
            }),
            T.git('notes.md is back on disk', (r) => r.exists('notes.md') || 'restore notes.md with `git restore`'),
            T.git('notes.md is unmodified', (r) => {
              const s = r.status();
              return !s.unstaged.includes('notes.md') && !s.staged.includes('notes.md') || 'notes.md should match the committed version';
            }),
            T.git('the experiment branch is gone', (r) => !r.branches().all.includes('experiment') || 'delete the experiment branch'),
            T.git('the reflog still remembers the experiment', (r) => {
              const out = r.run('git reflog --all');
              return /abandoned|experiment/i.test(out.stdout || '') || 'the abandoned commit should still be visible in the reflog';
            }),
            T.git('debug.log exists but is untracked', (r) => {
              if (!r.exists('debug.log')) return 'create a debug.log file';
              const s = r.status();
              return s.untracked.includes('debug.log') === false && !s.staged.includes('debug.log') || 'debug.log must be ignored, not untracked';
            }),
            T.git('.gitignore covers *.log', (r) => /\*\.log/.test(r.read('.gitignore') || '') || 'add *.log to .gitignore'),
            T.git('the working tree is clean', (r) => {
              const s = r.status();
              return s.staged.length + s.unstaged.length + s.untracked.length === 0 || `uncommitted: ${[...s.staged, ...s.unstaged, ...s.untracked].join(', ')}`;
            }),
          ],
        },
      ],
    },
  ],

  project: {
    id: 'git-capstone',
    title: 'Capstone: turn the portfolio into a real repository',
    minutes: 90,
    brief:
      'Put your portfolio under version control properly, publish it, and rehearse the two recovery drills you will actually need.\n\n' +
      'The deliverable is a public repository with a history that reads like a changelog, plus a written answer to the recovery questions.',
    starter: `portfolio-repo/
├── .gitignore
├── README.md
├── LICENSE
├── index.html
├── projects.html
├── contact.html
├── css/styles.css
└── js/main.js`,
    requirements: [
      'A public GitHub repository with the portfolio pushed to `main`',
      'At least eight commits, each one coherent, each with a `type: summary` message',
      'No commit contains `node_modules`, `.env`, `dist/` or an image over 1MB',
      'A `.gitignore` covering `node_modules/`, `dist/`, `.env`, `*.log` and OS files',
      'A README with a description, a screenshot, install/run instructions and the live URL',
      'A LICENSE file (MIT is fine)',
      'Two branches with pull requests: one `feat/*` merged with a real review comment, one `fix/*`',
      'A `main` branch that was never pushed to directly after the initial commit',
    ],
    checks: [
      '`git log --oneline` reads like a changelog with no "stuff" or "fixes" messages',
      '`git log --all --oneline -- node_modules` returns nothing',
      'Cloning the repository into a fresh directory and opening index.html works',
      '`git status` is clean on main',
      '`git branch -a` shows only main locally, with merged branches deleted',
      'Every pull request has a description explaining the why',
      'The reflog drill: delete a local branch, recover it with `git switch -c rescued <hash>`, document the hash you used',
      'The revert drill: push a deliberate mistake, then `git revert` it rather than force-pushing',
    ],
    stretch: [
      'Add a `CONTRIBUTING.md` and an issue template',
      'Protect `main` in GitHub settings so direct pushes are rejected',
      'Add a `pre-commit` hook that runs a formatter',
      'Sign your commits with a GPG key and show the Verified badge',
      'Add a GitHub Actions workflow that validates the HTML on every push',
    ],
  },
};
