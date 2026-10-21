# 7. Creating and editing a game

## 7.1 Choosing the game type

You create a game in the tab for its type on the *My games* page (→ 6.3). There are three types:

| Type | What you prepare | Where the answers and points come from |
|---|---|---|
| **Standard poll** | questions only | Voters type their own answers; the app counts them and turns them into points (→ 15). |
| **Points** | questions and a list of answers | Voters choose one of your answers; the points come from their choices (→ 15). |
| **Prepared** | questions, answers and points | You enter everything yourself — the game does not need a poll. |

You can change the game type later (→ 7.8).

## 7.2 The game editor

Select a game on the list and choose [Edit]. The editor consists of:

- the **Name** field at the top — here you can rename the game without leaving the editor,
- the **question list** on the left — with the [Add question] tile and a list of conditions the game must
  meet (→ 7.6),
- the **selected question** on the right — with the "Question text" field and the list of answers
  (a standard poll has no answers).

Click a question on the list to open it. To delete it, click the trash icon on its
tile and confirm — you will delete the question together with its answers.

On a narrower screen, the editor shows either the question list or the selected question; you go back
to the list with the [Back] button.

## 7.3 Questions and answers

- A **question** can have up to **100 characters**.
- An **answer** can have up to **17 characters** — that is how much fits in one row of the board on the
  Display. In final questions, the Display shows up to 11 characters of an answer.
- A question can have up to **6 answers** — the [Add answer] tile shows how many there are already.

Answers cannot contain characters the Display cannot show (for example emoji).
The app will not save such an answer and will show a message.

In a standard poll you enter only questions. In "Points" and prepared games —
answers as well.

You can also prepare questions and answers in a question base and create a game from them (→ 9.8).

## 7.4 Answer scoring

- **Points** — there is no points column. The points will come from the poll (→ 15.6).
- **Prepared** — you enter points for each answer (a number from 0 to 100). The
  "SUM" bar shows the total points in the question.

For a prepared game to be ready:

- each answer must have **at least 4 points**,
- the total points in a question can be **at most 100** — it does not have to equal 100.

The app will save values that do not meet these conditions, but it will mark them in red, and the game will not
be ready. How points count during a game (→ 3.2).

## 7.5 Saving and editing a game after the poll has started

The editor saves your changes by itself — there is no "Save" button:

- question and answer texts are saved a moment after you stop typing, and when you
  leave the field,
- points and the game name are saved when you leave the field (or press Enter).

An empty question or answer will be saved as "Question 1", "ANS 1" and so on.

**A game with a poll:**

- When the poll is **open** or **stopped**, editing is locked. To edit,
  abort the poll (→ 15.5) — the collected votes will be lost.
- When the poll is **closed**, the app will ask when you try to edit: "Reset poll?".
  If you choose [Reset], the votes, the respondents' answers and the poll links and QR codes
  will be deleted; the questions and answers stay, the points are reset to zero, and the game goes back to being a draft.

A game also cannot be edited while it is open somewhere else or while it is being
played — the app will show the reason.

## 7.6 Game readiness conditions

The list of conditions in the editor ("You can start the poll when:" or "The game is ready when:")
shows in real time what is met (green mark) and what is missing (red mark,
with the numbers of the questions concerned).

| Type | Conditions |
|---|---|
| All | at least **10 questions** (no upper limit) |
| Points | each question has from **3 to 6** answers |
| Prepared | each question has from **3 to 6** answers, each with at least **4 points**, a total of at most **100** per question |
| Standard poll | questions are enough — the poll will collect the answers |

In games with a poll, meeting the conditions lets you start the poll. You can play the game only after the poll
has been counted and closed (→ 15.6, 15.7).

## 7.7 Importing questions from a text file

In the editor, choose [Import]. You can paste text or load a `.txt` file. Format:

```
@Game name
# First question
first answer / 40
second answer / 30
third answer / 20
# Second question
1. answer
2. answer
3. answer
```

- A line starting with `#` is a question, the following lines are its answers.
- `@Game name` (optional, before the first question) sets the game name.
- Answer numbers (`1`, `1.`, `2)`, `3 -`, `4:`) are optional and will be skipped —
  so an answer that starts with a number (e.g. "100 years") will lose that number.
- Points after the slash `/` are optional and work only in a prepared game.

The window shows a preview: the number of questions and answers, and the first questions.

> Note: import **replaces** all the existing content of the game. The app will ask you to confirm.

Texts that are too long will be shortened (question to 100, answer to 17 characters), and if there are more than
6 answers, the first 6 stay. In a standard poll, answers from the file are not
loaded. If the file contains characters the Display cannot show, or an answer before
the first question, the app will point to the error and change nothing.

## 7.8 Changing the type of an existing game

Select the game in *My games* and choose [Change type]. **The same game** changes — it is not
a copy. If you want to keep the current version, use [Duplicate] first (→ 6.6).

- A game with an **open or stopped** poll cannot be changed at that moment.
- For a **closed** poll, the app will first ask whether to reset it (→ 7.5).
- Games in the Community Games tab cannot be changed.

In the "Change game type" window, each type has a description of what will happen — check it before choosing [Change]:

| New type | What happens to the content |
|---|---|
| Standard poll | Questions stay. Answers and points are removed. |
| Points | Questions and answers stay. Points are removed — they will come from the new poll. |
| Prepared | Questions and answers stay. You will need to fill in the points if there were none. |

From a standard poll only the questions carry over — you need to enter the answers. After the change, the game is
always a draft.
