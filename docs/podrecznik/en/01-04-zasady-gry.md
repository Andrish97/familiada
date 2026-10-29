# Part I — Game rules

# 1. What is the game about?

Two teams try to guess the most popular answers to questions that were asked earlier in a
survey. It is not about knowledge but about sensing what most people would say: for the
question "Name something you take to the beach", towel scores the most points, because that
is what most respondents said.

The teams face each other and the host runs the game. Each team has a captain (the "head of
the family") who starts the play. In the following rounds the teams uncover answers hidden on
the board and collect points. Every mistake puts an X on the board, and after three mistakes
the opponents get their chance. In later rounds points are worth more.

The game goes on until one of the teams has 300 points in total. The winning team picks two
finalists, who answer five questions in a short time. If together they score at least 200
points, the team wins the grand prize.

# 2. Survey questions and answers

## 2.1 Where the answers come from

The questions are asked earlier to survey respondents — ideally people of different ages and
backgrounds, so the results do not depend on one group. So in the game you do not guess the
"correct" answer but what people answered most often. It is not a quiz with one objectively
right answer.

## 2.2 How to read the board

The points next to an answer tell how many people out of 100 respondents gave it. The answers
are ordered from the most popular.

Rare answers do not make it onto the board. Example — "Name something you take to the beach":
towel 31 people, sunscreen 22, sunglasses 14. Single answers such as an umbrella (3 people),
a book (2) or a hammock (1) are left out. That is why the points on the board usually add up
to less than 100.

Questions with 3 to 8 recurring answers work best; questions with very scattered answers are
less interesting.

## 2.3 What an answer matching the board means

The team tries to guess the answers on the board. An answer that is on the board is
uncovered, and its points go to the round pool. An answer that is not on the board is a
mistake. Details (→ 3).

## 2.4 How the app uses poll results

The app can collect answers in your own poll (→ 15) and turn them into a board
of answers with points:

- **Any number of voters** — there can be fewer than 100 people or several hundred. To
  count the votes you need at least 10 people who answered all the questions
  (complete responses).
- **Points are the percentage of complete responses**, rounded down. If 20 out of 50 people
  gave the same answer, it gets 40 points — as if there were 100 respondents.
- **An answer makes it onto the board from 4 points.** Rarer answers are
  left out.
- **The board holds at most 6 answers** — that is how many rows the Display has. If more
  answers qualify, the six most popular stay.
- To close the poll, every question must have **at least 3** such answers.

In a standard poll, the app first merges identical answers, and you can merge
similar ones (e.g. "towel" and "towels") and fix typos. Only then does it count the points,
drop answers below 4 points and pick the top six (→ 15.6).

# 3. Round flow and the duel

Below is the classic course of a round. Where the app gives you a choice or works
differently, it is marked.

## 3.1 Round structure

Rounds are played one after another until a team has **300 points** in total. Three rounds
are usually enough, but the game goes on if nobody has reached the threshold.

**In the app:** you set the threshold yourself in the game settings (→ 16.6); the default is 300. The number of
rounds is not fixed — it depends on when a team reaches the threshold and on how many questions are prepared.

## 3.2 Scoring and the round multiplier

The round multiplier says how many times the points scored in a round count. The first three
rounds are regular, in the fourth the points are doubled, and from the fifth on — tripled.

| Round | 1 | 2 | 3 | 4 | 5 and later |
|---|---|---|---|---|---|
| Multiplier | ×1 | ×1 | ×1 | ×2 | ×3 |
| A 60-point pool gives | 60 | 60 | 60 | 120 | 180 |

**In the app:** these are the default settings. You can set your own multipliers for the
following rounds; the last multiplier applies to all further rounds (→ 16.6).

## 3.3 The duel at the start of a round

1. One person from each team comes to the buzzer (in the first round — the captains, then
   the next team members).
2. The host reads the question. Whoever presses the buzzer first answers first.
3. If it is the top answer — their team wins the duel.
4. Otherwise the other person answers. The one whose answer is higher on the board wins.
5. If both answers are not on the board, the next people from both teams answer.

The team that won the duel plays the question. It can also pass and give the question to the
opponents.

**In the app:** the buzzer signal shows who was first; the operator confirms the result of the
duel (→ 17.3). Passing the question is possible once per round, before the first answer is
uncovered.

## 3.4 Answering as a team

After the duel the members of the playing team answer in turn. Every correct answer is
uncovered and its points go to the round pool (on the board — the "bank"). The playing team
may not confer.

## 3.5 Mistakes and taking over the points

- An answer that is not on the board is a **mistake** — an X appears on the board and the
  buzzer sounds.
- There are **3 seconds** to answer. The limit keeps the game moving: no answer in time is
  also a mistake. The host signals that time is up, and an X appears on the board.
- After **three mistakes**, before all answers are uncovered, the question goes to the
  opponents. They may confer from the playing team's second mistake.
- The opposing team's captain gives **one** answer. If it is on the board, the whole round
  pool goes to their team. If not, the pool stays with the playing team.

**In the app:** taking over the points is called a **steal**. The operator starts the
three-second countdown when an answer drags on; when time is up the app adds the X itself (→ 17.3).

## 3.6 End of the round and threshold check

The round ends when the team uncovers all the answers or after the takeover attempt. The round
pool, multiplied by the round multiplier, goes to the team that won it. Then the threshold is
checked: if a team has 300 points or more in total, it goes on to the final. The threshold
applies to the team's total score, not to the number of answers or the multiplier.

## 3.7 How the app handles it

The app checks the threshold after settling each round. When a team reaches it:

- it goes on to the **final**, if the final is enabled (→ 16.5.1),
- or the game **ends**, if the final is disabled — the end screen shows the score from the rounds.

The game also ends without a final when **the questions run out** before either team
reaches the threshold.

How the Control panel guides the operator through these stages (→ 17).

# 4. The final

## 4.1 How the final goes

1. The winning team's captain picks **two finalists**.
2. The second finalist must not hear or see the first one's answers — for example they leave
   the room for a moment or put on headphones.
3. The **first finalist** answers **5 questions** in **15 seconds**. They can skip a question
   and come back to it if there is time left.
4. The answers appear on the board with their survey points; an answer that is not on the
   board gives 0 points. Then the first finalist's answers disappear from the board.
5. The **second finalist** comes back, the host tells them how many points their partner
   scored and reads the same five questions. They have **20 seconds**, because this part is harder.
6. The second finalist **may not repeat** the first one's answers — a repeat sounds the
   buzzer and they must give another one.
7. The second finalist's answers and points are revealed next to the first one's.

## 4.2 Scoring

The points of both finalists add up. There is **no multiplier** in the final — the survey
points count.

**In the app:** final points always count once.

## 4.3 The final points target

The finalists' goal is **at least 200 points** together.

**In the app:** you set the target yourself in the game settings (→ 16.6); the default is 200. When the finalists
reach it, the operator can end the final right away, without revealing the remaining questions (→ 17.4).

## 4.4 Grand prize and settling the score

- If the finalists score 200 points or more, the team wins the **grand prize**, added to what
  it won earlier (round points times the prize multiplier).
- If not, the team receives only **the points from rounds before the final times the prize
  multiplier**. Final points are not included in this multiplication; they only determine
  whether the grand prize is awarded.

**In the app:** the end screen can show the logo, the points or the prize amount (→ 16.6). You set
the grand prize amount and the multiplier yourself (default 25,000 and ×3). The amount is
the winning team's points from the rounds times the multiplier, plus the grand prize when the finalists reach the
target. The points scored in the final only decide whether the target was reached.
