# 6. My games

## 6.1 What the "My games" page is for

*My games* is the page you land on after logging in, and where most of your work starts.
From the top bar you can go from here to the other parts of the app: question bases, logos,
Community Games, friends, subscribers, tasks and connecting devices. The counters next to the
buttons show things waiting for you: invitations, received copies, tasks
and shared devices. On a narrower screen some of the buttons are in the [More] menu.

If your browser supports it, the top bar also shows an [Install Familiada|download] icon — it adds
Familiada to your phone's home screen or your desktop. This is especially handy on a phone used
as a buzzer and on the host's tablet (→ 17.1).

The page is the library of your games, including copies received from friends. Games are divided
into tabs:

- **Standard poll**, **Points**, **Prepared** — games of that type (→ 7.1),
- **Community Games** — games added from the public catalogue.

On a phone the tabs have shorter names: "Poll", "Points", "Prep." and "Community".

![*My games* — the "Prepared" tab](zrzut:games)

## 6.2 The game list and game statuses

Each game is a tile with its name and status:

| Status | What it means |
|---|---|
| DRAFT | The game is being prepared. You can edit it. |
| OPEN | The poll is running — voters can answer. The number of votes cast is shown next to it. |
| STOPPED | Collecting answers is paused. The "to be counted" badge reminds you that you can count the votes (→ 15.6). |
| READY | The game is ready to play. |

A prepared game has no poll, so its status is only DRAFT or READY — READY when it meets
all the conditions (→ 7.6).

Under the game name, the app shows what is missing for the next step, for example:
"The game needs at least 10 questions (you have 7)." or
"Question #3: needs 3–6 answers (it has 2)." This way you know what to fill in in the editor.

A copy received from a friend is marked "From: {name}".

Above the list you can choose a filter: DRAFT, OPEN, STOPPED, READY or "Received"
(only copies from friends). The list refreshes by itself.

![Game statuses and the blocking reason on the tile](zrzut:games-prepared-states)
![Game status filter](zrzut:games-filter-menu)

## 6.3 Creating and selecting a game

1. Choose the tab with the type of game you want to create (differences → 7.1).
2. Click the [+ New game] tile.
3. Enter a name (up to 80 characters) and choose [Save].

The new game appears on the list as a draft and is selected right away. To add questions,
choose [Edit] (→ 7.2).

Clicking a tile selects the game — only then do the action buttons become active.

![Creating a new game](zrzut:games-new-poll-text)

## 6.4 Actions on the selected game

Once a game is selected, the top bar offers:

| Button | What it does |
|---|---|
| [Play] | Opens the *Control panel* and starts preparing the game (→ 17). |
| [Game settings] | Teams, look, sounds, questions and game rules (→ 16). |
| [Edit] | Opens the question and answer editor (→ 7.2). |
| [Preview] | Shows the questions and answers without editing. For a game with a poll, you can switch the view to the poll results. |
| [Poll] | Opens this game's poll (→ 15). A prepared game has no poll. |

On the bottom bar: [Duplicate], [Change type], [Export to file], [Export to base],
[Import] and [Send]. On a phone these buttons are shown as icons only.

Which buttons are available depends on the type and state of the game. Hover over an inactive button (or
press and hold it on a phone) to see the reason. The most important rules:

- [Play] — a prepared game must be ready (→ 7.6), and a game with a poll must have its poll
  closed.
- [Edit] and [Change type] — not available while the poll is open or stopped. When the poll is
  closed, the app will first ask whether to reset it (→ 7.5).
- [Poll] — to start it, the game must have at least 10 questions; in a "Points" game
  also from 3 to 6 answers in each question.

[Change type] changes the same game — it does not create a copy. Details → 7.8.

On a phone and in a narrow browser window the [Play] and [Game settings] buttons are hidden —
open the *Control panel* and *Game settings* on a computer or tablet.

In the **Community Games** tab only [Play], [Preview] and [Game settings] are available.
These games cannot be edited, duplicated, exported or sent (→ 13.4).

![A selected game that is not ready — playing disabled](zrzut:games-prepared-not-ready)

## 6.5 Renaming and deleting a game

**Renaming** — double-click the game tile (on a phone, tap it twice),
enter the new name and confirm.

**Deleting** — click the trash icon on the tile and confirm. If the game has an open or
stopped poll, the app will warn you: "The poll will be aborted." — the collected votes will be lost.

A game that is open somewhere else (in the editor, settings, poll or in another browser
tab) cannot be deleted or renamed at that moment. The app will then show
"This game is open elsewhere." Close that window and try again.

In the Community Games tab, the trash icon means [Remove from library] (→ 13.4).

![Renaming a game](zrzut:games-rename)
![Deleting a game with an open poll](zrzut:games-delete-open-poll)

## 6.6 Duplicating games and sending copies

- [Duplicate] creates a copy of the game in your library, named "{name} copy".
- [Send] gives a copy of the game to a friend (→ 11).

Each copy is independent: changes to the copy do not change the original and vice versa.

What goes into the copy:

| Game state | Copy |
|---|---|
| Draft | A draft with the same content. |
| Poll open or stopped | A draft without the collected votes (the app will warn you about this in the "Without current votes" window). |
| Poll closed | A ready game, with the poll result. |

You can send a friend a prepared game or a game with a poll, as long as it is a draft. Games with
an open, stopped or closed poll cannot be sent.

Duplicating and sending require an account (→ 5.1). This is different from adding a game from Community
Games (→ 13.4).

![Duplicating an open poll — without the current votes](zrzut:games-duplicate-votes)

## 6.7 Importing and exporting

**Export to file.** Select a game and choose [Export to file]. The app will save a file
with the `.famgame` extension, which you can keep or move to another account.

- A draft and a prepared game go into the file in full.
- A closed poll keeps its result.
- For an open or stopped poll, the app will warn you that the collected votes will not go
  into the file — after import it will be a draft.

**Import from file.** Choose [Import] and pick a `.famgame` (or `.json`) file. Before
confirming, you will see the name, the game type and the number of questions, as well as notes, for example when the poll
result in the file is incomplete and the game will be added to the library as a draft. Import always creates
a new game — it does not change existing ones.

During import, texts that are too long are shortened (question to 100 characters, answer to 17),
and if there are more than 6 answers, the 6 highest-scoring ones stay. An imported game may
need to be completed — you will see what is missing under its name (→ 6.2).

> Note: being able to export or duplicate a game does not mean it is ready to
> play.

**Export to a question base.** [Export to base] copies the game's questions and answers to the selected
question base. A folder named after the game is created in the base's root folder. You can choose
your own base or a base shared with you with edit rights (→ 12.4). If you don't have such a base,
the window shows "No bases found." — create a base first (→ 9.1). For an open or stopped poll, the app
first warns you that the collected votes won't be copied to the base.

Don't edit the contents of `.famgame` files by hand — importing such a file may fail.

![Importing a game with a file preview](zrzut:games-import-preview)
![Export to a question base](zrzut:games-export-base)
