# Part I — Game show rules

Based on the [Familiada game show regulations](https://s.tvp.pl/repository/attachment/6/8/f/68f09c03ff0781fa510c2fd90c3ba19b1569224834470.pdf)
(Telewizja Polska S.A.).

# 1. What is Familiada?

Familiada is a game show in which two families try to guess the most popular answers to
questions asked earlier in a survey. It is not about knowledge but about sensing what most
people would say: for the question "Name something yellow", banana scores the most points,
because that is what most respondents said.

The families stand facing each other, with the host between them. Each family has its own
"head", who starts the game. Over the rounds, the teams reveal the answers hidden on the board
and collect points. Each mistake is an X on the board, and after three mistakes
the opponents get their chance. Points are worth more in later rounds.

The game goes on until one of the families reaches a total of 300 points. The winning family
chooses two finalists, who answer five questions in a short time. If together they score
at least 200 points, the family wins the grand prize.

# 2. Survey questions and answers

## 2.1 Where the answers come from

The questions are asked in advance to respondents — people of different ages and backgrounds,
so that the results do not depend on one group. So in the game show you are not guessing the
"correct" answer, but what people answered most often. Familiada is not a quiz with one
objectively correct answer.

## 2.2 How to read the board

In the game show, each question is asked to **100 respondents**. The points next to an answer
are the **number of people** who gave it, and the answers are ordered from the most popular.

Rare answers do not make it onto the board. An example from the regulations — "Name something
yellow": banana 29 people, lemon 19, daffodil 15. Answers such as a hat (3 people),
wool (2) or road markings (1) were left out. That is why the points on the board usually
add up to less than 100.

The show uses questions that got between 3 and 8 repeated answers; questions with very
scattered answers are dropped.

## 2.3 What an answer matching the board means

The team tries to guess the answers on the board. An answer that is on the board is
revealed, and its points go into the round pool. An answer that is not on the board is a mistake.
Details (→ 3).

## 2.4 How the app uses poll results

The app can collect answers in your own poll (→ 15) and turn them into a board
in the same way:

- **Any number of voters** — there can be fewer than 100 people or several hundred. To
  count the votes you need at least 10 people who answered all the questions
  (complete responses).
- **Points are the percentage of complete responses**, rounded down. If 20 out of 50 people
  gave the same answer, it gets 40 points — as if there were 100 respondents.
- **An answer makes it onto the board from 4 points.** Rarer answers are left out, just like
  in the game show.
- **The board holds at most 6 answers** — that is how many rows the Display has. If more
  answers qualify, the six most popular stay. This is a screen limit,
  not a game show rule.
- To close the poll, every question must have **at least 3** such answers.

In a standard poll, the app first merges identical answers, and you can merge
similar ones (e.g. "banana" and "bananas") and fix typos. Only then does it count the points,
drop answers below 4 points and pick the top six (→ 15.6).

# 3. Round flow and the duel

The app follows the order and mechanics of the rounds from the game show. Differences are
described at the relevant points.

## 3.1 Round structure

Rounds are played one after another until one of the families reaches a total of **300 points**.
Three rounds are usually enough, but the game goes on if nobody has reached the threshold.

**In the app:** you set the threshold yourself in the game settings (→ 16.6); the default is 300. The number of rounds is not fixed —
it depends on when one of the teams reaches the threshold and on how many questions you prepared.

## 3.2 Scoring and the round multiplier

The round multiplier says how many times the points won in a given round count. In the game show,
the first three rounds are normal, in the fourth the points are doubled, and from the fifth — tripled.

| Round | 1 | 2 | 3 | 4 | 5 and later |
|---|---|---|---|---|---|
| Multiplier | ×1 | ×1 | ×1 | ×2 | ×3 |
| A 60-pt pool gives | 60 | 60 | 60 | 120 | 180 |

**In the app:** these are the default settings. You can set your own multipliers for the following rounds;
the last multiplier applies to all further rounds (→ 16.6).

## 3.3 The duel at the start of a round

1. One person from each team steps up to the buzzer stand (in the first round — the "heads"
   of the families, then the other members).
2. The host reads the question. Whoever presses the buzzer first answers first.
3. If it is the top-scoring answer, their team wins the duel.
4. Otherwise the other person answers. The one whose answer is higher on the
   board wins.
5. If both answers are off the board, the next people from both teams answer.

The team that won the duel goes on playing the question. According to the regulations, it can also
pass and hand the question over to the opponents.

**In the app:** the buzzer signal shows who was first; the operator confirms the result of the
duel (→ 17.3). Passing the question is possible once per round, before the first answer
is revealed.

## 3.4 Answering as a team

After the duel, the members of the playing team answer in turn. Each correct answer
is revealed, and its points go into the round pool (on the board — the "bank"). The playing team
may not confer.

## 3.5 Mistakes and taking over the points

- An answer that is not on the board is a **mistake** — an X appears on the board and a buzzer sounds.
- You have **3 seconds** to answer. The limit keeps the game moving: no answer in time is also
  a mistake. The host signals that time is up, and an X appears on the board.
- After **three mistakes**, before all the answers are revealed, the question passes to the
  opponents. They may confer from the playing team's second mistake.
- The "head" of the opposing team gives **one** answer. If it is on the board, the whole round
  pool goes to their team. If not — the pool stays with the playing team.

**In the app:** taking over the points is called a **steal**. The operator starts the three-second countdown
when an answer takes too long; when time runs out, the app adds an X by itself (→ 17.3).

## 3.6 End of the round and threshold check

The round ends when the team reveals all the answers or after the steal attempt.
The round pool, multiplied by the round multiplier, goes to the team that won it.
Then the threshold is checked: if a team has a total of 300 points or more, it goes on
to the final. The threshold applies to the team's total score, not to the number of answers or the multiplier.

## 3.7 How the app handles it

The app checks the threshold after settling each round. When a team reaches it:

- it goes on to the **final**, if the final is enabled (→ 16.5.1),
- or the game **ends**, if the final is disabled — the end screen shows the score from the rounds.

The game also ends without a final when **the questions run out** before either team
reaches the threshold.

How the Control panel guides the operator through these stages (→ 17).

# 4. The game show final

## 4.1 How the final goes

1. The "head" of the winning family picks **two finalists**.
2. The second finalist leaves the stage and gets headphones with music, so as not to hear or
   see the first finalist's answers.
3. **The first finalist** answers **5 questions** in **15 seconds**. They can skip a question
   and come back to it if there is time left.
4. The answers appear on the board with the points from the survey; an answer off the board gives
   0 points. Then the first finalist's answers disappear from the board.
5. **The second finalist** comes back, the host tells them how many points their partner scored, and reads the same
   five questions. They have **20 seconds**, because this part is harder.
6. The second finalist **may not repeat** the first finalist's answers — if they do, a
   buzzer sounds and they must give a different one.
7. The second finalist's answers and points are revealed next to the first finalist's answers.

## 4.2 Scoring

The points of both finalists are added up. There is **no multiplier** in the final — the survey points count.

**In the app:** the same — final points always count once.

## 4.3 The final points target

The finalists' goal is **at least 200 points** together.

**In the app:** you set the target yourself in the game settings (→ 16.6); the default is 200. When the finalists reach it, the operator
can end the final right away, without revealing the remaining questions (→ 17.4).

## 4.4 Grand prize and settling the score

- If the finalists score 200 points or more, the family wins the **grand prize —
  25,000 PLN**, added to the money won earlier.
- If not — the family gets the money collected during the game: **the number of points multiplied by 3**.

**In the app:** the end screen can show the logo, the points or the prize amount (→ 16.6). You set
the grand prize amount and the multiplier yourself (default 25,000 and ×3). The amount is
the winning team's points from the rounds times the multiplier, plus the grand prize when the finalists reach the
target. The points scored in the final only decide whether the target was reached.
