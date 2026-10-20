# Working on CodeCraft

Start with `README.md` for the layout of the repo, which holds two games: Bladecraft (`/`) and
CodeCraft (`/codecraft/`). CodeCraft's design lives in the wiki (`apps/wiki/src/content/`),
Bladecraft's in `docs/BLADECRAFT.md`. The stack and its lessons are in `docs/STACK.md`, and
decisions that differ from any of these are in `DEVIATIONS.md`.

## Writing copy

This covers wiki pages, READMEs, `DEVIATIONS.md`, UI text and code comments.

**Write for someone who has never seen this project.** Picture a friend reading the wiki cold, or
an agent working here long after today's conversation is gone. They can't see our chat history,
deleted code, earlier drafts or anything that isn't in the repo. A reference to "the prototype",
"the original brief" or "what you asked for" means nothing to them.

**Describe what is, not how it got that way.** When something changes, find the places that are
no longer true and rewrite them so they read as if they had always said the new thing. Don't add
"now", "no longer", "instead of the old…", "was removed", or notes about what used to be there.
History belongs in git and commit messages.

**Add words only when they explain something that isn't obvious.** When a decision changes, update
the sentence it affects. Don't tack the decision onto the end of a nearby sentence, and don't add
a paragraph announcing it. If a sentence was fine before, it's probably still fine.

**This isn't a ban on explaining.** Saying *why* a design is the way it is is useful. "Jump moves
one floor at a time so you stay oriented in a deep tree" helps a newcomer. "Jump departs from the
original idea" doesn't. Comparisons to things a reader can look up (Create, AE2, React DevTools)
are fine. Open design questions stay, phrased as questions about the future, not as records of the
past.

`DEVIATIONS.md` lists the decisions currently in force, each with its reason. When a decision
changes, edit its entry rather than appending a correction.
