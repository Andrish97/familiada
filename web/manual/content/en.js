// Wygenerowane przez scripts/manual/build-content.mjs z docs/podrecznik — nie edytować ręcznie.
const manual = {
 "parts": [
  {
   "title": "Part I — Game show rules",
   "chapters": [
    "1",
    "2",
    "3",
    "4"
   ],
   "intro": "<p class=\"m-p\">Based on the <a href=\"https://s.tvp.pl/repository/attachment/6/8/f/68f09c03ff0781fa510c2fd90c3ba19b1569224834470.pdf\" target=\"_blank\" rel=\"noopener\">Familiada game show regulations</a> (Telewizja Polska S.A.).</p>"
  },
  {
   "title": "Part II — Using the app",
   "chapters": [
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14"
   ],
   "intro": ""
  }
 ],
 "chapters": [
  {
   "id": "1",
   "title": "What is Familiada?",
   "sections": [],
   "html": "<p class=\"m-p\">Familiada is a game show in which two families try to guess the most popular answers to questions asked earlier in a survey. It is not about knowledge but about sensing what most people would say: for the question &quot;Name something yellow&quot;, banana scores the most points, because that is what most respondents said.</p>\n<p class=\"m-p\">The families stand facing each other, with the host between them. Each family has its own &quot;head&quot;, who starts the game. Over the rounds, the teams reveal the answers hidden on the board and collect points. Mistakes are marked on the board with an X, and after three mistakes the opponents get their chance. Points are worth more in later rounds.</p>\n<p class=\"m-p\">The game goes on until one of the families reaches a total of 300 points. The winning family chooses two finalists, who answer five questions in a short time. If together they score at least 200 points, the family wins the grand prize.</p>"
  },
  {
   "id": "2",
   "title": "Survey questions and answers",
   "sections": [
    {
     "id": "2.1",
     "title": "Where the answers come from",
     "level": 2
    },
    {
     "id": "2.2",
     "title": "How to read the board",
     "level": 2
    },
    {
     "id": "2.3",
     "title": "What an answer matching the board means",
     "level": 2
    },
    {
     "id": "2.4",
     "title": "How the app uses poll results",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-2-1\"><span class=\"m-num\">2.1</span> Where the answers come from</h2>\n<p class=\"m-p\">The questions are asked in advance to respondents — people of different ages and backgrounds, so that the results do not depend on one group. So in the game show you are not guessing the &quot;correct&quot; answer, but what people answered most often. Familiada is not a quiz with one objectively correct answer.</p>\n<h2 class=\"m-h2\" id=\"s-2-2\"><span class=\"m-num\">2.2</span> How to read the board</h2>\n<p class=\"m-p\">In the game show, each question is asked to <strong>100 respondents</strong>. The points next to an answer are the <strong>number of people</strong> who gave it, and the answers are ordered from the most popular.</p>\n<p class=\"m-p\">Rare answers do not make it onto the board. An example from the regulations — &quot;Name something yellow&quot;: banana 29 people, lemon 19, daffodil 15. Answers such as a hat (3 people), wool (2) or road markings (1) were left out. That is why the points on the board usually add up to less than 100.</p>\n<p class=\"m-p\">The show uses questions that got between 3 and 8 repeated answers; questions with very scattered answers are dropped.</p>\n<h2 class=\"m-h2\" id=\"s-2-3\"><span class=\"m-num\">2.3</span> What an answer matching the board means</h2>\n<p class=\"m-p\">The team tries to guess the answers on the board. An answer that is on the board is revealed, and its points go into the round pool. An answer that is not on the board is a mistake. How this works in a round → <a class=\"m-ref\" href=\"?ch=3\">3</a>.</p>\n<h2 class=\"m-h2\" id=\"s-2-4\"><span class=\"m-num\">2.4</span> How the app uses poll results</h2>\n<p class=\"m-p\">The app can collect answers in your own poll (→ <a class=\"m-ref\" href=\"?ch=15\">15</a>) and turn them into a board in the same way:</p>\n<ul class=\"m-ul\"><li><strong>Any number of voters</strong> — there can be fewer than 100 people or several hundred. To count the votes you need at least 10 people who answered all the questions (complete responses).</li><li><strong>Points are the percentage of complete responses</strong>, rounded down. If 20 out of 50 people gave the same answer, it gets 40 points — as if there were 100 respondents.</li><li><strong>An answer makes it onto the board from 4 points.</strong> Rarer answers are left out, just like in the game show.</li><li><strong>The board holds at most 6 answers</strong> — that is how many rows the Display has. If more answers qualify, the six most popular stay. This is a screen limit, not a game show rule.</li><li>To close the poll, every question must have <strong>at least 3</strong> such answers.</li></ul>\n<p class=\"m-p\">In a standard poll, the app first merges identical answers, and you can merge similar ones (e.g. &quot;banana&quot; and &quot;bananas&quot;) and fix typos. Only then does it count the points, drop answers below 4 points and pick the top six (→ <a class=\"m-ref\" href=\"?ch=15#s-15-6\">15.6</a>).</p>"
  },
  {
   "id": "3",
   "title": "Round flow and the duel",
   "sections": [
    {
     "id": "3.1",
     "title": "Round structure",
     "level": 2
    },
    {
     "id": "3.2",
     "title": "Scoring and the round multiplier",
     "level": 2
    },
    {
     "id": "3.3",
     "title": "The duel at the start of a round",
     "level": 2
    },
    {
     "id": "3.4",
     "title": "Answering as a team",
     "level": 2
    },
    {
     "id": "3.5",
     "title": "Mistakes and taking over the points",
     "level": 2
    },
    {
     "id": "3.6",
     "title": "End of the round and threshold check",
     "level": 2
    },
    {
     "id": "3.7",
     "title": "How the app handles it",
     "level": 2
    }
   ],
   "html": "<p class=\"m-p\">The app follows the order and mechanics of the rounds from the game show. Differences are described at the relevant points.</p>\n<h2 class=\"m-h2\" id=\"s-3-1\"><span class=\"m-num\">3.1</span> Round structure</h2>\n<p class=\"m-p\">Rounds are played one after another until one of the families reaches a total of <strong>300 points</strong>. Three rounds are usually enough, but the game goes on if nobody has reached the threshold.</p>\n<p class=\"m-p\"><strong>In the app:</strong> you set the threshold yourself (default 300 → <a class=\"m-ref\" href=\"?ch=16#s-16-6\">16.6</a>). The number of rounds is not fixed — it depends on when one of the teams reaches the threshold and on how many questions you prepared.</p>\n<h2 class=\"m-h2\" id=\"s-3-2\"><span class=\"m-num\">3.2</span> Scoring and the round multiplier</h2>\n<p class=\"m-p\">The round multiplier says how many times the points won in a given round count. In the game show, the first three rounds are normal, in the fourth the points are doubled, and from the fifth — tripled.</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Round</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5 and later</th></tr></thead><tbody><tr><td>Multiplier</td><td>×1</td><td>×1</td><td>×1</td><td>×2</td><td>×3</td></tr><tr><td>A 60-pt pool gives</td><td>60</td><td>60</td><td>60</td><td>120</td><td>180</td></tr></tbody></table></div>\n<p class=\"m-p\"><strong>In the app:</strong> these are the default settings. You can set your own multipliers for the following rounds; the last multiplier applies to all further rounds (→ <a class=\"m-ref\" href=\"?ch=16#s-16-6\">16.6</a>).</p>\n<h2 class=\"m-h2\" id=\"s-3-3\"><span class=\"m-num\">3.3</span> The duel at the start of a round</h2>\n<ol class=\"m-ol\"><li>One person from each team steps up to the buzzer stand (in the first round — the &quot;heads&quot; of the families, then the other members).</li><li>The host reads the question. Whoever presses the buzzer first answers first.</li><li>If it is the top-scoring answer, their team wins the duel.</li><li>Otherwise the other person answers. The one whose answer is higher on the board wins.</li><li>If both answers are off the board, the next people from both teams answer.</li></ol>\n<p class=\"m-p\">The team that won the duel goes on playing the question. According to the regulations, it can also pass and hand the question over to the opponents.</p>\n<p class=\"m-p\"><strong>In the app:</strong> the buzzer signal shows who was first; the operator confirms the result of the duel (→ <a class=\"m-ref\" href=\"?ch=17#s-17-3\">17.3</a>). Passing the question is possible once per round, before the first answer is revealed.</p>\n<h2 class=\"m-h2\" id=\"s-3-4\"><span class=\"m-num\">3.4</span> Answering as a team</h2>\n<p class=\"m-p\">After the duel, the members of the playing team answer in turn. Each correct answer is revealed, and its points go into the round pool (on the board — the &quot;bank&quot;). The playing team may not confer.</p>\n<h2 class=\"m-h2\" id=\"s-3-5\"><span class=\"m-num\">3.5</span> Mistakes and taking over the points</h2>\n<ul class=\"m-ul\"><li>An answer that is not on the board is a <strong>mistake</strong> — an X appears on the board and a buzzer sounds.</li><li>You have <strong>3 seconds</strong> to answer. The limit keeps the game moving: no answer in time is also a mistake. The host signals that time is up, and an X appears on the board.</li><li>After <strong>three mistakes</strong>, before all the answers are revealed, the question passes to the opponents. They may confer from the playing team's second mistake.</li><li>The &quot;head&quot; of the opposing team gives <strong>one</strong> answer. If it is on the board, the whole round pool goes to their team. If not — the pool stays with the playing team.</li></ul>\n<p class=\"m-p\"><strong>In the app:</strong> taking over the points is called a <strong>steal</strong>. The operator starts the three-second countdown when an answer takes too long; when time runs out, the app adds an X by itself (→ <a class=\"m-ref\" href=\"?ch=17#s-17-3\">17.3</a>).</p>\n<h2 class=\"m-h2\" id=\"s-3-6\"><span class=\"m-num\">3.6</span> End of the round and threshold check</h2>\n<p class=\"m-p\">The round ends when the team reveals all the answers or after the steal attempt. The round pool, multiplied by the round multiplier, goes to the team that won it. Then the threshold is checked: if a team has a total of 300 points or more, it goes on to the final. The threshold applies to the team's total score, not to the number of answers or the multiplier.</p>\n<h2 class=\"m-h2\" id=\"s-3-7\"><span class=\"m-num\">3.7</span> How the app handles it</h2>\n<p class=\"m-p\">The app checks the threshold after settling each round. When a team reaches it:</p>\n<ul class=\"m-ul\"><li>it goes on to the <strong>final</strong>, if the final is enabled (→ <a class=\"m-ref\" href=\"?ch=16#s-16-5-1\">16.5.1</a>),</li><li>or the game <strong>ends</strong>, if the final is disabled — the end screen shows the score from the rounds.</li></ul>\n<p class=\"m-p\">The game also ends without a final when <strong>the questions run out</strong> before either team reaches the threshold.</p>\n<p class=\"m-p\">How the Control panel guides the operator through these stages → <a class=\"m-ref\" href=\"?ch=17\">17</a>.</p>"
  },
  {
   "id": "4",
   "title": "The game show final",
   "sections": [
    {
     "id": "4.1",
     "title": "How the final goes",
     "level": 2
    },
    {
     "id": "4.2",
     "title": "Scoring",
     "level": 2
    },
    {
     "id": "4.3",
     "title": "The final points target",
     "level": 2
    },
    {
     "id": "4.4",
     "title": "Grand prize and settling the score",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-4-1\"><span class=\"m-num\">4.1</span> How the final goes</h2>\n<ol class=\"m-ol\"><li>The &quot;head&quot; of the winning family picks <strong>two finalists</strong>.</li><li>The second finalist leaves the stage and gets headphones with music, so as not to hear or see the first finalist's answers.</li><li><strong>The first finalist</strong> answers <strong>5 questions</strong> in <strong>15 seconds</strong>. They can skip a question and come back to it if there is time left.</li><li>The answers appear on the board with the points from the survey; an answer off the board gives 0 points. Then the first finalist's answers disappear from the board.</li><li><strong>The second finalist</strong> comes back, the host tells them how many points their partner scored, and reads the same five questions. They have <strong>20 seconds</strong>, because this part is harder.</li><li>The second finalist <strong>may not repeat</strong> the first finalist's answers — if they do, a buzzer sounds and they must give a different one.</li><li>The second finalist's answers and points are revealed next to the first finalist's answers.</li></ol>\n<h2 class=\"m-h2\" id=\"s-4-2\"><span class=\"m-num\">4.2</span> Scoring</h2>\n<p class=\"m-p\">The points of both finalists are added up. There is <strong>no multiplier</strong> in the final — the survey points count.</p>\n<p class=\"m-p\"><strong>In the app:</strong> the same — final points always count once.</p>\n<h2 class=\"m-h2\" id=\"s-4-3\"><span class=\"m-num\">4.3</span> The final points target</h2>\n<p class=\"m-p\">The finalists' goal is <strong>at least 200 points</strong> together.</p>\n<p class=\"m-p\"><strong>In the app:</strong> you set the target yourself (default 200 → <a class=\"m-ref\" href=\"?ch=16#s-16-6\">16.6</a>). When the finalists reach it, the operator can end the final right away, without revealing the remaining questions (→ <a class=\"m-ref\" href=\"?ch=17#s-17-4\">17.4</a>).</p>\n<h2 class=\"m-h2\" id=\"s-4-4\"><span class=\"m-num\">4.4</span> Grand prize and settling the score</h2>\n<ul class=\"m-ul\"><li>If the finalists score 200 points or more, the family wins the <strong>grand prize — 25,000 PLN</strong>, added to the money won earlier.</li><li>If not — the family gets the money collected during the game: <strong>the number of points multiplied by 3</strong>.</li></ul>\n<p class=\"m-p\"><strong>In the app:</strong> the end screen can show the logo, the points or the prize amount (→ <a class=\"m-ref\" href=\"?ch=16#s-16-6\">16.6</a>). You set the grand prize amount and the multiplier yourself (default 25,000 and ×3). The app multiplies the round points together with the final points by this multiplier, and adds the grand prize once the target is reached.</p>"
  },
  {
   "id": "5",
   "title": "User account",
   "sections": [
    {
     "id": "5.1",
     "title": "Ways to use the app",
     "level": 2
    },
    {
     "id": "5.2",
     "title": "Registration and email confirmation",
     "level": 2
    },
    {
     "id": "5.3",
     "title": "Logging in and out",
     "level": 2
    },
    {
     "id": "5.4",
     "title": "Guest account and saving your data",
     "level": 2
    },
    {
     "id": "5.5",
     "title": "Username and profile",
     "level": 2
    },
    {
     "id": "5.6",
     "title": "Changing your email address and password",
     "level": 2
    },
    {
     "id": "5.7",
     "title": "Recovering access and security",
     "level": 2
    },
    {
     "id": "5.8",
     "title": "Other account settings",
     "level": 2
    },
    {
     "id": "5.9",
     "title": "Deleting your account",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-5-1\"><span class=\"m-num\">5.1</span> Ways to use the app</h2>\n<p class=\"m-p\">You can use the app in two ways:</p>\n<ul class=\"m-ul\"><li><strong>with an account</strong> — you create it with an email address and a password. You get access to all features and can log in on any device;</li><li><strong>as a guest</strong> — no registration, with one click. You can create games, polls, question bases and logos and run games, but your data is only available in this browser (→ <a class=\"m-ref\" href=\"?ch=5#s-5-4\">5.4</a>).</li></ul>\n<p class=\"m-p\">The <span class=\"m-page\">Login</span> page has the buttons <span class=\"m-control\"><i data-icon=\"arrow-right\"></i>Log in</span>, <span class=\"m-control\"><i data-icon=\"plus\"></i>Create account</span>, <span class=\"m-control\"><i data-icon=\"person\"></i>Continue as guest</span> and <span class=\"m-control\"><i data-icon=\"envelope\"></i>Forgot password</span>.</p>\n<p class=\"m-p\">You need an account to work with other people. Only with an account can you:</p>\n<ul class=\"m-ul\"><li>have friends and subscribers and receive tasks (→ <a class=\"m-ref\" href=\"?ch=10\">10</a>, <a class=\"m-ref\" href=\"?ch=14\">14</a>, <a class=\"m-ref\" href=\"?ch=15#s-15-4\">15.4</a>),</li><li>duplicate games and logos and send copies of them to friends (→ <a class=\"m-ref\" href=\"?ch=6#s-6-6\">6.6</a>, <a class=\"m-ref\" href=\"?ch=11\">11</a>),</li><li>share question bases (→ <a class=\"m-ref\" href=\"?ch=12\">12</a>),</li><li>send poll invitations (→ <a class=\"m-ref\" href=\"?ch=15#s-15-2\">15.2</a>),</li><li>share devices for a game (→ <a class=\"m-ref\" href=\"?ch=17#s-17-1\">17.1</a>),</li><li>submit and rate Community Games (→ <a class=\"m-ref\" href=\"?ch=13\">13</a>).</li></ul>\n<p class=\"m-p\">If you open a page that is only available to accounts while you are a guest, you will see the message &quot;Not available for guest account&quot;.</p>\n<h2 class=\"m-h2\" id=\"s-5-2\"><span class=\"m-num\">5.2</span> Registration and email confirmation</h2>\n<ol class=\"m-ol\"><li>On the <span class=\"m-page\">Login</span> page, choose <span class=\"m-control\"><i data-icon=\"plus\"></i>Create account</span>.</li><li>Enter your email address and password, and repeat the password (password requirements → <a class=\"m-ref\" href=\"?ch=5#s-5-6\">5.6</a>).</li><li>Confirm. You will receive the message &quot;FAMILIADA — Confirm your account&quot; at that address.</li><li>Click <span class=\"m-control\">CONFIRM ACCOUNT</span> in it. You will see &quot;Done! Account confirmed.&quot; and go to <span class=\"m-page\">My games</span>.</li></ol>\n<p class=\"m-p\">Until you confirm your address, you cannot log in — the app will remind you: &quot;Confirm your email (link in inbox).&quot;</p>\n<p class=\"m-p\">Your username is created automatically from your email address; you can change it later (→ <a class=\"m-ref\" href=\"?ch=5#s-5-5\">5.5</a>).</p>\n<p class=\"m-p\"><strong>Common situations:</strong></p>\n<ul class=\"m-ul\"><li><span class=\"m-page\">No message arrived</span> — check your spam folder. If you try to create the account again, the app will offer <span class=\"m-control\"><i data-icon=\"refresh\"></i>Resend</span>. You can resend once an hour.</li><li><span class=\"m-page\">The address is already registered</span> — the app will show &quot;This account already exists. Switching to login.&quot; Log in or recover your password (→ <a class=\"m-ref\" href=\"?ch=5#s-5-7\">5.7</a>).</li></ul>\n<h2 class=\"m-h2\" id=\"s-5-3\"><span class=\"m-num\">5.3</span> Logging in and out</h2>\n<p class=\"m-p\">On the <span class=\"m-page\">Login</span> page, enter your <strong>email address or username</strong> (upper and lower case do not matter) and your password, and choose <span class=\"m-control\"><i data-icon=\"arrow-right\"></i>Log in</span>. After logging in, you go to <span class=\"m-page\">My games</span>.</p>\n<p class=\"m-p\">You stay logged in in this browser until you log out. To log out, click your name in the top right corner and choose <span class=\"m-control\"><i data-icon=\"close\"></i>Log out</span>.</p>\n<p class=\"m-p\">If you open a link from a message (for example to a task, a friend invitation or a shared base) while you are not logged in, you will return to that place after logging in.</p>\n<div class=\"m-note\"><p class=\"m-p\">Note: if you use a guest account in this browser, logging in to another account will delete the guest data. The app will ask about this in the &quot;Active guest session&quot; window. To keep your data, first save the guest account as a regular account (→ <a class=\"m-ref\" href=\"?ch=5#s-5-4\">5.4</a>).</p></div>\n<h2 class=\"m-h2\" id=\"s-5-4\"><span class=\"m-num\">5.4</span> Guest account and saving your data</h2>\n<p class=\"m-p\">Choose <span class=\"m-control\"><i data-icon=\"person\"></i>Continue as guest</span> on the <span class=\"m-page\">Login</span> page. A guest account:</p>\n<ul class=\"m-ul\"><li>works only in this browser — you cannot open it on another device,</li><li>is deleted after <strong>5 days without using the app</strong>; each visit restarts the count,</li><li>does not have the collaboration features listed in 5.1.</li></ul>\n<p class=\"m-p\">From time to time the app reminds you that the guest account will be deleted and offers <span class=\"m-control\">Migrate now</span>.</p>\n<p class=\"m-p\"><strong>How to keep your guest data</strong> — turn the guest account into a regular account. Games, question bases, logos and other files will be kept.</p>\n<ol class=\"m-ol\"><li>Open <span class=\"m-page\">Account settings</span> (click your name in the top right corner) and find the &quot;Save your data&quot; section. You can also choose <span class=\"m-control\"><i data-icon=\"plus\"></i>Create account</span> on the <span class=\"m-page\">Login</span> page and confirm with <span class=\"m-control\">Yes, migrate data</span>.</li><li>Enter your email address, password and — optionally — a username, then choose <span class=\"m-control\"><i data-icon=\"restore\"></i>Migrate account</span>.</li><li>Click the link in the message &quot;FAMILIADA — Confirm migration&quot;. From then on you use a regular account.</li></ol>\n<p class=\"m-p\">Until you click the link, you keep using the guest account. The message can be resent once an hour.</p>\n<h2 class=\"m-h2\" id=\"s-5-5\"><span class=\"m-num\">5.5</span> Username and profile</h2>\n<p class=\"m-p\">Your username is shown in the top right corner, and also to friends and subscribers — for example in invitations and on copies you send. You can also use it to log in.</p>\n<p class=\"m-p\">Requirements:</p>\n<ul class=\"m-ul\"><li>from 3 to 20 characters,</li><li>only letters, digits and the characters <code class=\"m-code\">_</code> <code class=\"m-code\">.</code> <code class=\"m-code\">-</code>,</li><li>the name must not be taken by someone else; some names are reserved (for example ones starting with &quot;admin&quot; or &quot;familiada&quot;).</li></ul>\n<p class=\"m-p\">To change your name, open <span class=\"m-page\">Account settings</span>, enter a new one in the &quot;Username&quot; section and choose <span class=\"m-control\"><i data-icon=\"save\"></i>Save name</span>. You can change your name once an hour.</p>\n<p class=\"m-p\">If your account does not have a permanent name yet (for example after saving a guest account without a name), you will see the &quot;First login&quot; screen asking you to set one when you log in.</p>\n<h2 class=\"m-h2\" id=\"s-5-6\"><span class=\"m-num\">5.6</span> Changing your email address and password</h2>\n<p class=\"m-p\"><strong>Email address.</strong> In <span class=\"m-page\">Account settings</span>, in the &quot;Email&quot; section, enter the new address and choose <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Change email</span>. Messages with a link will arrive <strong>at both the current and the new address</strong> — confirm both. This way nobody can take over your account knowing only one of the addresses. Until you confirm, you log in with your current address. You can also <span class=\"m-control\"><i data-icon=\"refresh\"></i>Resend</span> or <span class=\"m-control\"><i data-icon=\"close\"></i>Cancel change</span>. You can start a change once an hour.</p>\n<p class=\"m-p\">If you no longer have access to the old address, the change will not be confirmed. In that case you can export your games, bases and logos to files, delete the account, create a new one and import the files (→ <a class=\"m-ref\" href=\"?ch=6#s-6-7\">6.7</a>).</p>\n<p class=\"m-p\"><strong>Password.</strong> In the &quot;Password&quot; section, enter the new password and choose <span class=\"m-control\"><i data-icon=\"save\"></i>Change password</span>. The password must have:</p>\n<ul class=\"m-ul\"><li>at least 8 characters,</li><li>a lowercase and an uppercase letter,</li><li>a digit,</li><li>a special character (for example <code class=\"m-code\">!</code> or <code class=\"m-code\">#</code>).</li></ul>\n<p class=\"m-p\">The new password must be different from the previous one. You can change your password once an hour.</p>\n<h2 class=\"m-h2\" id=\"s-5-7\"><span class=\"m-num\">5.7</span> Recovering access and security</h2>\n<p class=\"m-p\">If you forgot your password:</p>\n<ol class=\"m-ol\"><li>On the <span class=\"m-page\">Login</span> page, enter your email address or username and choose <span class=\"m-control\"><i data-icon=\"envelope\"></i>Forgot password</span>.</li><li>Click <span class=\"m-control\">SET NEW PASSWORD</span> in the message &quot;FAMILIADA — Password reset&quot;.</li><li>Enter the new password twice and choose <span class=\"m-control\"><i data-icon=\"save\"></i>Save password</span>. You will return to the login page.</li></ol>\n<p class=\"m-p\">You can request another message with a link only after an hour — the app will show how much time is left.</p>\n<p class=\"m-p\">After several failed login attempts, the app may ask for an extra confirmation &quot;Confirm you are human&quot; — choose <span class=\"m-control\">Continue</span> and log in again.</p>\n<h2 class=\"m-h2\" id=\"s-5-8\"><span class=\"m-num\">5.8</span> Other account settings</h2>\n<p class=\"m-p\">In <span class=\"m-page\">Account settings</span> you will also find:</p>\n<ul class=\"m-ul\"><li><strong>Email notifications</strong> — the &quot;Enable email notifications&quot; switch. When it is off, you will not get messages about friend invitations, tasks, shared bases and copies. You will still see the invitations and copies themselves in the app.</li><li><strong>Your rating</strong> — a preview of the rating and comment you gave the app.</li><li><strong>Demo Materials</strong> — <span class=\"m-control\"><i data-icon=\"refresh\"></i>Restore demo files</span> adds sample games, question bases and logos.</li></ul>\n<div class=\"m-note\"><p class=\"m-p\">Note: restoring replaces your existing demo materials, including the ones you changed. If you want to keep your changes, duplicate that game, base or logo first.</p></div>\n<h2 class=\"m-h2\" id=\"s-5-9\"><span class=\"m-num\">5.9</span> Deleting your account</h2>\n<p class=\"m-p\">In <span class=\"m-page\">Account settings</span>, in the &quot;Delete account&quot; section, enter your password and choose <span class=\"m-control\"><i data-icon=\"trash\"></i>Delete account and data</span>. A guest account is deleted without a password, after confirming in a window.</p>\n<div class=\"m-note\"><p class=\"m-p\">Note: deleting cannot be undone.</p></div>\n<p class=\"m-p\">What gets deleted:</p>\n<ul class=\"m-ul\"><li>your games (including their polls), question bases and logos — also other people's access to your bases,</li><li>your access to bases shared by others,</li><li>friendships, subscriptions, tasks, invitations and received copies,</li><li>games added from Community Games and your ratings.</li></ul>\n<p class=\"m-p\">What stays:</p>\n<ul class=\"m-ul\"><li>copies of games and logos you sent to others earlier — they now belong to the recipients,</li><li>your answers in other people's polls — no longer linked to you,</li><li>games you published in Community Games — without your name as the author.</li></ul>\n<p class=\"m-p\">If you want to keep your materials, export them to files before deleting (→ <a class=\"m-ref\" href=\"?ch=6#s-6-7\">6.7</a>, <a class=\"m-ref\" href=\"?ch=8#s-8-5\">8.5</a>, <a class=\"m-ref\" href=\"?ch=9#s-9-1\">9.1</a>).</p>"
  },
  {
   "id": "6",
   "title": "My games",
   "sections": [
    {
     "id": "6.1",
     "title": "What the \"My games\" page is for",
     "level": 2
    },
    {
     "id": "6.2",
     "title": "The game list and game statuses",
     "level": 2
    },
    {
     "id": "6.3",
     "title": "Creating and selecting a game",
     "level": 2
    },
    {
     "id": "6.4",
     "title": "Actions on the selected game",
     "level": 2
    },
    {
     "id": "6.5",
     "title": "Renaming and deleting a game",
     "level": 2
    },
    {
     "id": "6.6",
     "title": "Duplicating games and sending copies",
     "level": 2
    },
    {
     "id": "6.7",
     "title": "Importing and exporting",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-6-1\"><span class=\"m-num\">6.1</span> What the &quot;My games&quot; page is for</h2>\n<p class=\"m-p\"><span class=\"m-page\">My games</span> is the page you land on after logging in, and where most of your work starts. From the top bar you can go from here to the other parts of the app: question bases, logos, friends, subscribers, tasks and connecting devices.</p>\n<p class=\"m-p\">The page is the library of your games, including copies received from friends. Games are divided into tabs:</p>\n<ul class=\"m-ul\"><li><strong>Standard poll</strong>, <strong>Points</strong>, <strong>Prepared</strong> — games of that type (→ <a class=\"m-ref\" href=\"?ch=7#s-7-1\">7.1</a>),</li><li><strong>Community Games</strong> — games added from the public catalog (→ <a class=\"m-ref\" href=\"?ch=13\">13</a>).</li></ul>\n<p class=\"m-p\">On a phone the tabs have shorter names: &quot;Poll&quot;, &quot;Points&quot;, &quot;Prep.&quot; and &quot;Community&quot;.</p>\n<h2 class=\"m-h2\" id=\"s-6-2\"><span class=\"m-num\">6.2</span> The game list and game statuses</h2>\n<p class=\"m-p\">Each game is a tile with its name and status:</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Status</th><th>What it means</th></tr></thead><tbody><tr><td>DRAFT</td><td>The game is being prepared. You can edit it.</td></tr><tr><td>OPEN</td><td>The poll is running — voters can answer. The number of votes cast is shown next to it.</td></tr><tr><td>STOPPED</td><td>Collecting answers is paused. The &quot;to be counted&quot; badge reminds you that you can count the votes (→ <a class=\"m-ref\" href=\"?ch=15#s-15-6\">15.6</a>).</td></tr><tr><td>READY</td><td>The game is ready to play.</td></tr></tbody></table></div>\n<p class=\"m-p\">A prepared game has no poll, so its status is only DRAFT or READY — READY when it meets all the conditions (→ <a class=\"m-ref\" href=\"?ch=7#s-7-6\">7.6</a>).</p>\n<p class=\"m-p\">Under the game name, the app shows what is missing for the next step, for example: &quot;The game needs at least 10 questions (you have 7).&quot; or &quot;Question #3: needs 3–6 answers (it has 2).&quot; This way you know what to fill in in the editor.</p>\n<p class=\"m-p\">A copy received from a friend is marked &quot;From: {name}&quot;.</p>\n<p class=\"m-p\">Above the list you can choose a filter: DRAFT, OPEN, STOPPED, READY or &quot;Received&quot; (only copies from friends). The list refreshes by itself.</p>\n<h2 class=\"m-h2\" id=\"s-6-3\"><span class=\"m-num\">6.3</span> Creating and selecting a game</h2>\n<ol class=\"m-ol\"><li>Choose the tab with the type of game you want to create (differences → <a class=\"m-ref\" href=\"?ch=7#s-7-1\">7.1</a>).</li><li>Click the <span class=\"m-control\">+ New game</span> tile.</li><li>Enter a name (up to 80 characters) and choose <span class=\"m-control\"><i data-icon=\"save\"></i>Save</span>.</li></ol>\n<p class=\"m-p\">The new game appears on the list as a draft and is selected right away. To add questions, choose <span class=\"m-control\"><i data-icon=\"edit-paper\"></i>Edit</span> (→ <a class=\"m-ref\" href=\"?ch=7#s-7-2\">7.2</a>).</p>\n<p class=\"m-p\">Clicking a tile selects the game — only then do the action buttons become active.</p>\n<h2 class=\"m-h2\" id=\"s-6-4\"><span class=\"m-num\">6.4</span> Actions on the selected game</h2>\n<p class=\"m-p\">Once a game is selected, the top bar offers:</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Button</th><th>What it does</th></tr></thead><tbody><tr><td><span class=\"m-control\"><i data-icon=\"gamepad\"></i>Play</span></td><td>Opens the <span class=\"m-page\">Control panel</span> and starts preparing the game (→ <a class=\"m-ref\" href=\"?ch=17\">17</a>).</td></tr><tr><td><span class=\"m-control\"><i data-icon=\"settings\"></i>Game settings</span></td><td>Teams, look, sounds, questions and game rules (→ <a class=\"m-ref\" href=\"?ch=16\">16</a>).</td></tr><tr><td><span class=\"m-control\"><i data-icon=\"edit-paper\"></i>Edit</span></td><td>Opens the question and answer editor (→ <a class=\"m-ref\" href=\"?ch=7#s-7-2\">7.2</a>).</td></tr><tr><td><span class=\"m-control\"><i data-icon=\"eye\"></i>Preview</span></td><td>Shows the questions and answers without editing. For a game with a poll, you can switch the view to the poll results.</td></tr><tr><td><span class=\"m-control\"><i data-icon=\"polls\"></i>Poll</span></td><td>Opens this game's poll (→ <a class=\"m-ref\" href=\"?ch=15\">15</a>). A prepared game has no poll.</td></tr></tbody></table></div>\n<p class=\"m-p\">On the bottom bar: <span class=\"m-control\"><i data-icon=\"duplicate\"></i>Duplicate</span>, <span class=\"m-control\"><i data-icon=\"change-type\"></i>Change type</span>, <span class=\"m-control\"><i data-icon=\"download\"></i>Export to file</span>, <span class=\"m-control\"><i data-icon=\"drawer-export\"></i>Export to base</span>, <span class=\"m-control\"><i data-icon=\"upload\"></i>Import</span> and <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Send</span>. On a phone these buttons are shown as icons only.</p>\n<p class=\"m-p\">Which buttons are available depends on the type and state of the game. Hover over an inactive button (or press and hold it on a phone) to see the reason. The most important rules:</p>\n<ul class=\"m-ul\"><li><span class=\"m-control\"><i data-icon=\"gamepad\"></i>Play</span> — a prepared game must be ready (→ <a class=\"m-ref\" href=\"?ch=7#s-7-6\">7.6</a>), and a game with a poll must have its poll closed.</li><li><span class=\"m-control\"><i data-icon=\"edit-paper\"></i>Edit</span> and <span class=\"m-control\"><i data-icon=\"change-type\"></i>Change type</span> — not available while the poll is open or stopped. When the poll is closed, the app will first ask whether to reset it (→ <a class=\"m-ref\" href=\"?ch=7#s-7-5\">7.5</a>).</li><li><span class=\"m-control\"><i data-icon=\"polls\"></i>Poll</span> — to start it, the game must have at least 10 questions; in a &quot;Points&quot; game also from 3 to 6 answers in each question.</li></ul>\n<p class=\"m-p\"><span class=\"m-control\"><i data-icon=\"change-type\"></i>Change type</span> changes the same game — it does not create a copy. Details → <a class=\"m-ref\" href=\"?ch=7#s-7-8\">7.8</a>.</p>\n<p class=\"m-p\">In the <strong>Community Games</strong> tab only <span class=\"m-control\"><i data-icon=\"gamepad\"></i>Play</span>, <span class=\"m-control\"><i data-icon=\"eye\"></i>Preview</span> and <span class=\"m-control\"><i data-icon=\"settings\"></i>Game settings</span> are available. These games cannot be edited, duplicated, exported or sent (→ <a class=\"m-ref\" href=\"?ch=13#s-13-4\">13.4</a>).</p>\n<h2 class=\"m-h2\" id=\"s-6-5\"><span class=\"m-num\">6.5</span> Renaming and deleting a game</h2>\n<p class=\"m-p\"><strong>Renaming</strong> — double-click the game tile (on a phone, tap it twice), enter the new name and confirm.</p>\n<p class=\"m-p\"><strong>Deleting</strong> — click the trash icon on the tile and confirm. If the game has an open or stopped poll, the app will warn you: &quot;The poll will be aborted.&quot; — the collected votes will be lost.</p>\n<p class=\"m-p\">A game that is open somewhere else (in the editor, settings, poll or in another browser tab) cannot be deleted or renamed at that moment. The app will then show &quot;This game is open elsewhere.&quot; Close that window and try again.</p>\n<p class=\"m-p\">In the Community Games tab, the trash icon means <span class=\"m-control\">Remove from library</span> (→ <a class=\"m-ref\" href=\"?ch=13#s-13-4\">13.4</a>).</p>\n<h2 class=\"m-h2\" id=\"s-6-6\"><span class=\"m-num\">6.6</span> Duplicating games and sending copies</h2>\n<ul class=\"m-ul\"><li><span class=\"m-control\"><i data-icon=\"duplicate\"></i>Duplicate</span> creates a copy of the game in your library, named &quot;{name} copy&quot;.</li><li><span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Send</span> gives a copy of the game to a friend (→ <a class=\"m-ref\" href=\"?ch=11\">11</a>).</li></ul>\n<p class=\"m-p\">Each copy is independent: changes to the copy do not change the original and vice versa.</p>\n<p class=\"m-p\">What goes into the copy:</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Game state</th><th>Copy</th></tr></thead><tbody><tr><td>Draft</td><td>A draft with the same content.</td></tr><tr><td>Poll open or stopped</td><td>A draft without the collected votes (the app will warn you about this in the &quot;Without current votes&quot; window).</td></tr><tr><td>Poll closed</td><td>A ready game, with the poll result.</td></tr></tbody></table></div>\n<p class=\"m-p\">You can send a friend a poll draft or a prepared game; an open, stopped or closed poll cannot be sent.</p>\n<p class=\"m-p\">Duplicating and sending require an account (→ <a class=\"m-ref\" href=\"?ch=5#s-5-1\">5.1</a>). This is different from adding a game from Community Games (→ <a class=\"m-ref\" href=\"?ch=13#s-13-4\">13.4</a>).</p>\n<h2 class=\"m-h2\" id=\"s-6-7\"><span class=\"m-num\">6.7</span> Importing and exporting</h2>\n<p class=\"m-p\"><strong>Export to file.</strong> Select a game and choose <span class=\"m-control\"><i data-icon=\"download\"></i>Export to file</span>. The app will save a file with the <code class=\"m-code\">.famgame</code> extension, which you can keep or move to another account.</p>\n<ul class=\"m-ul\"><li>A draft and a prepared game go into the file in full.</li><li>A closed poll keeps its result.</li><li>For an open or stopped poll, the app will warn you that the collected votes will not go into the file — after import it will be a draft.</li></ul>\n<p class=\"m-p\"><strong>Import from file.</strong> Choose <span class=\"m-control\"><i data-icon=\"upload\"></i>Import</span> and pick a <code class=\"m-code\">.famgame</code> (or <code class=\"m-code\">.json</code>) file. Before confirming, you will see the name, the game type and the number of questions, as well as notes, for example when the poll result in the file is incomplete and the game will be added to the library as a draft. Import always creates a new game — it does not change existing ones.</p>\n<p class=\"m-p\">During import, texts that are too long are shortened (question to 100 characters, answer to 17), and if there are more than 6 answers, the 6 highest-scoring ones stay. An imported game may need to be completed — you will see what is missing under its name (→ <a class=\"m-ref\" href=\"?ch=6#s-6-2\">6.2</a>).</p>\n<div class=\"m-note\"><p class=\"m-p\">Note: being able to export or duplicate a game does not mean it is ready to play.</p></div>\n<p class=\"m-p\"><strong>Export to a question base.</strong> <span class=\"m-control\"><i data-icon=\"drawer-export\"></i>Export to base</span> copies the game's questions and answers to the selected question base (→ <a class=\"m-ref\" href=\"?ch=9\">9</a>). A folder named after the game is created in the base's root folder. You can choose your own base or a base shared with you with edit rights (→ <a class=\"m-ref\" href=\"?ch=12#s-12-4\">12.4</a>).</p>"
  },
  {
   "id": "7",
   "title": "Creating and editing a game",
   "sections": [
    {
     "id": "7.1",
     "title": "Choosing the game type",
     "level": 2
    },
    {
     "id": "7.2",
     "title": "The game editor",
     "level": 2
    },
    {
     "id": "7.3",
     "title": "Questions and answers",
     "level": 2
    },
    {
     "id": "7.4",
     "title": "Answer scoring",
     "level": 2
    },
    {
     "id": "7.5",
     "title": "Saving and editing a game after the poll has started",
     "level": 2
    },
    {
     "id": "7.6",
     "title": "Game readiness conditions",
     "level": 2
    },
    {
     "id": "7.7",
     "title": "Importing questions from a text file",
     "level": 2
    },
    {
     "id": "7.8",
     "title": "Changing the type of an existing game",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-7-1\"><span class=\"m-num\">7.1</span> Choosing the game type</h2>\n<p class=\"m-p\">You create a game in the tab for its type on the <span class=\"m-page\">My games</span> page (→ <a class=\"m-ref\" href=\"?ch=6#s-6-3\">6.3</a>). There are three types:</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Type</th><th>What you prepare</th><th>Where the answers and points come from</th></tr></thead><tbody><tr><td><strong>Standard poll</strong></td><td>questions only</td><td>Voters type their own answers; the app counts them and turns them into points (→ <a class=\"m-ref\" href=\"?ch=15\">15</a>).</td></tr><tr><td><strong>Points</strong></td><td>questions and a list of answers</td><td>Voters choose one of your answers; the points come from their choices (→ <a class=\"m-ref\" href=\"?ch=15\">15</a>).</td></tr><tr><td><strong>Prepared</strong></td><td>questions, answers and points</td><td>You enter everything yourself — the game does not need a poll.</td></tr></tbody></table></div>\n<p class=\"m-p\">You can change the game type later (→ <a class=\"m-ref\" href=\"?ch=7#s-7-8\">7.8</a>).</p>\n<h2 class=\"m-h2\" id=\"s-7-2\"><span class=\"m-num\">7.2</span> The game editor</h2>\n<p class=\"m-p\">Select a game on the list and choose <span class=\"m-control\"><i data-icon=\"edit-paper\"></i>Edit</span>. The editor consists of:</p>\n<ul class=\"m-ul\"><li>the <strong>Name</strong> field at the top — here you can rename the game without leaving the editor,</li><li>the <strong>question list</strong> on the left — with the <span class=\"m-control\">Add question</span> tile and a list of conditions the game must meet (→ <a class=\"m-ref\" href=\"?ch=7#s-7-6\">7.6</a>),</li><li>the <strong>selected question</strong> on the right — with the &quot;Question text&quot; field and the list of answers (a standard poll has no answers).</li></ul>\n<p class=\"m-p\">Click a question on the list to open it. To delete it, click the trash icon on its tile and confirm — you will delete the question together with its answers.</p>\n<p class=\"m-p\">On a narrower screen, the editor shows either the question list or the selected question; you go back to the list with the <span class=\"m-control\"><i data-icon=\"arrow-left\"></i>Back</span> button.</p>\n<h2 class=\"m-h2\" id=\"s-7-3\"><span class=\"m-num\">7.3</span> Questions and answers</h2>\n<ul class=\"m-ul\"><li>A <strong>question</strong> can have up to <strong>100 characters</strong>.</li><li>An <strong>answer</strong> can have up to <strong>17 characters</strong> — that is how much fits in one row of the board on the Display. In final questions, the Display shows up to 11 characters of an answer.</li><li>A question can have up to <strong>6 answers</strong> — the <span class=\"m-control\">Add answer</span> tile shows how many there are already.</li></ul>\n<p class=\"m-p\">Answers cannot contain characters the Display cannot show (for example emoji). The app will not save such an answer and will show a message.</p>\n<p class=\"m-p\">In a standard poll you enter only questions. In &quot;Points&quot; and prepared games — answers as well.</p>\n<p class=\"m-p\">You can also prepare questions and answers in a question base and create a game from them (→ <a class=\"m-ref\" href=\"?ch=9#s-9-8\">9.8</a>).</p>\n<h2 class=\"m-h2\" id=\"s-7-4\"><span class=\"m-num\">7.4</span> Answer scoring</h2>\n<ul class=\"m-ul\"><li><strong>Points</strong> — there is no points column. The points will come from the poll (→ <a class=\"m-ref\" href=\"?ch=15#s-15-6\">15.6</a>).</li><li><strong>Prepared</strong> — you enter points for each answer (a number from 0 to 100). The &quot;SUM&quot; bar shows the total points in the question.</li></ul>\n<p class=\"m-p\">For a prepared game to be ready:</p>\n<ul class=\"m-ul\"><li>each answer must have <strong>at least 4 points</strong>,</li><li>the total points in a question can be <strong>at most 100</strong> — it does not have to equal 100.</li></ul>\n<p class=\"m-p\">The app will save values that do not meet these conditions, but it will mark them in red, and the game will not be ready. How points count during a game → <a class=\"m-ref\" href=\"?ch=3\">3</a>.</p>\n<h2 class=\"m-h2\" id=\"s-7-5\"><span class=\"m-num\">7.5</span> Saving and editing a game after the poll has started</h2>\n<p class=\"m-p\">The editor saves your changes by itself — there is no &quot;Save&quot; button:</p>\n<ul class=\"m-ul\"><li>question and answer texts are saved a moment after you stop typing, and when you leave the field,</li><li>points and the game name are saved when you leave the field (or press Enter).</li></ul>\n<p class=\"m-p\">An empty question or answer will be saved as &quot;Question 1&quot;, &quot;ANS 1&quot; and so on.</p>\n<p class=\"m-p\"><strong>A game with a poll:</strong></p>\n<ul class=\"m-ul\"><li>When the poll is <strong>open</strong> or <strong>stopped</strong>, editing is locked. To edit, abort the poll (the collected votes will be lost → <a class=\"m-ref\" href=\"?ch=15#s-15-5\">15.5</a>).</li><li>When the poll is <strong>closed</strong>, the app will ask when you try to edit: &quot;Reset poll?&quot;. If you choose <span class=\"m-control\"><i data-icon=\"restore\"></i>Reset</span>, the votes, the respondents' answers and the poll links and QR codes will be deleted; the questions and answers stay, the points are reset to zero, and the game goes back to being a draft.</li></ul>\n<p class=\"m-p\">A game also cannot be edited while it is open somewhere else or while it is being played — the app will show the reason.</p>\n<h2 class=\"m-h2\" id=\"s-7-6\"><span class=\"m-num\">7.6</span> Game readiness conditions</h2>\n<p class=\"m-p\">The list of conditions in the editor (&quot;You can start the poll when:&quot; or &quot;The game is ready when:&quot;) shows in real time what is met (green mark) and what is missing (red mark, with the numbers of the questions concerned).</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Type</th><th>Conditions</th></tr></thead><tbody><tr><td>All</td><td>at least <strong>10 questions</strong> (no upper limit)</td></tr><tr><td>Points</td><td>each question has from <strong>3 to 6</strong> answers</td></tr><tr><td>Prepared</td><td>each question has from <strong>3 to 6</strong> answers, each with at least <strong>4 points</strong>, a total of at most <strong>100</strong> per question</td></tr><tr><td>Standard poll</td><td>questions are enough — the poll will collect the answers</td></tr></tbody></table></div>\n<p class=\"m-p\">In games with a poll, meeting the conditions lets you start the poll. You can play the game only after the poll has been counted and closed (→ <a class=\"m-ref\" href=\"?ch=15#s-15-6\">15.6</a>, <a class=\"m-ref\" href=\"?ch=15#s-15-7\">15.7</a>).</p>\n<h2 class=\"m-h2\" id=\"s-7-7\"><span class=\"m-num\">7.7</span> Importing questions from a text file</h2>\n<p class=\"m-p\">In the editor, choose <span class=\"m-control\"><i data-icon=\"upload\"></i>Import</span>. You can paste text or load a <code class=\"m-code\">.txt</code> file. Format:</p>\n<pre class=\"m-pre\">@Game name\n# First question\nfirst answer / 40\nsecond answer / 30\nthird answer / 20\n# Second question\n1. answer\n2. answer\n3. answer</pre>\n<ul class=\"m-ul\"><li>A line starting with <code class=\"m-code\">#</code> is a question, the following lines are its answers.</li><li><code class=\"m-code\">@Game name</code> (optional, before the first question) sets the game name.</li><li>Answer numbers (<code class=\"m-code\">1</code>, <code class=\"m-code\">1.</code>, <code class=\"m-code\">2)</code>, <code class=\"m-code\">3 -</code>, <code class=\"m-code\">4:</code>) are optional and will be skipped — so an answer that starts with a number (e.g. &quot;100 years&quot;) will lose that number.</li><li>Points after the slash <code class=\"m-code\">/</code> are optional and work only in a prepared game.</li></ul>\n<p class=\"m-p\">The window shows a preview: the number of questions and answers, and the first questions.</p>\n<div class=\"m-note\"><p class=\"m-p\">Note: import <strong>replaces</strong> all the existing content of the game. The app will ask you to confirm.</p></div>\n<p class=\"m-p\">Texts that are too long will be shortened (question to 100, answer to 17 characters), and if there are more than 6 answers, the first 6 stay. In a standard poll, answers from the file are not loaded. If the file contains characters the Display cannot show, or an answer before the first question, the app will point to the error and change nothing.</p>\n<h2 class=\"m-h2\" id=\"s-7-8\"><span class=\"m-num\">7.8</span> Changing the type of an existing game</h2>\n<p class=\"m-p\">Select the game in <span class=\"m-page\">My games</span> and choose <span class=\"m-control\"><i data-icon=\"change-type\"></i>Change type</span>. <strong>The same game</strong> changes — it is not a copy. If you want to keep the current version, use <span class=\"m-control\"><i data-icon=\"duplicate\"></i>Duplicate</span> first (→ <a class=\"m-ref\" href=\"?ch=6#s-6-6\">6.6</a>).</p>\n<ul class=\"m-ul\"><li>A game with an <strong>open or stopped</strong> poll cannot be changed at that moment.</li><li>For a <strong>closed</strong> poll, the app will first ask whether to reset it (→ <a class=\"m-ref\" href=\"?ch=7#s-7-5\">7.5</a>).</li><li>Community games cannot be changed.</li></ul>\n<p class=\"m-p\">In the &quot;Change game type&quot; window, each type has a description of what will happen — check it before choosing <span class=\"m-control\">Change</span>:</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>New type</th><th>What happens to the content</th></tr></thead><tbody><tr><td>Standard poll</td><td>Questions stay. Answers and points are removed.</td></tr><tr><td>Points</td><td>Questions and answers stay. Points are removed — they will come from the new poll.</td></tr><tr><td>Prepared</td><td>Questions and answers stay. You will need to fill in the points if there were none.</td></tr></tbody></table></div>\n<p class=\"m-p\">From a standard poll only the questions carry over — you need to enter the answers. After the change, the game is always a draft.</p>"
  },
  {
   "id": "8",
   "title": "Game logo: creating and using",
   "sections": [
    {
     "id": "8.1",
     "title": "What a game logo is",
     "level": 2
    },
    {
     "id": "8.2",
     "title": "Creating a text logo",
     "level": 2
    },
    {
     "id": "8.3",
     "title": "Drawing a logo",
     "level": 2
    },
    {
     "id": "8.4",
     "title": "Creating a logo from an image",
     "level": 2
    },
    {
     "id": "8.5",
     "title": "Saving, choosing and displaying a logo",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-8-1\"><span class=\"m-num\">8.1</span> What a game logo is</h2>\n<p class=\"m-p\">A game logo is a caption or picture that you prepare yourself and that appears during the game — among other places at the start and at the end of the game. It is not the Familiada app logo: if you do not choose your own, the game will show the default logo.</p>\n<p class=\"m-p\">You create and store logos on the <span class=\"m-page\">My logos</span> page. You can assign a different logo to each game (→ <a class=\"m-ref\" href=\"?ch=8#s-8-5\">8.5</a>).</p>\n<div class=\"m-note\"><p class=\"m-p\">Note: logos are created on a computer or tablet. On a phone you can browse the list of logos, but the editor is not available.</p></div>\n<h2 class=\"m-h2\" id=\"s-8-2\"><span class=\"m-num\">8.2</span> Creating a text logo</h2>\n<ol class=\"m-ol\"><li>On the <span class=\"m-page\">My logos</span> page, click the &quot;New text logo&quot; tile, enter a name for the logo and confirm.</li><li>Type the caption (for example &quot;FAMILIADA&quot;).</li></ol>\n<p class=\"m-p\">The caption is shown in a font like the classic Familiada logo. The &quot;Width: …/30&quot; counter shows whether the caption fits on the Display. The <span class=\"m-control\"><i data-icon=\"text\"></i>Allowed characters</span> button shows the characters you can use. A caption that is too wide or contains characters that are not allowed will not be saved — the app will point out the problem.</p>\n<p class=\"m-p\">If you want the caption in a different typeface or with extras, use a drawn logo (→ <a class=\"m-ref\" href=\"?ch=8#s-8-3\">8.3</a>).</p>\n<h2 class=\"m-h2\" id=\"s-8-3\"><span class=\"m-num\">8.3</span> Drawing a logo</h2>\n<p class=\"m-p\">Click the &quot;New drawn logo&quot; tile. You draw on the canvas in two colors — black and white; the white elements will light up on the Display.</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Tool</th><th>Shortcut</th><th>What it is for</th></tr></thead><tbody><tr><td>Pointer</td><td>V</td><td>selecting and moving elements</td></tr><tr><td>Hand</td><td>H (or hold the space bar)</td><td>moving the view</td></tr><tr><td>Brush</td><td>B</td><td>freehand drawing</td></tr><tr><td>Eraser</td><td>E</td><td>removes the elements it touches</td></tr><tr><td>Shapes</td><td>S</td><td>line, rectangle, ellipse, polygon, star, arrows, heart and more</td></tr><tr><td>Text</td><td>T</td><td>captions — with many typefaces to choose from</td></tr></tbody></table></div>\n<p class=\"m-p\">You also have: zooming the view in and out, the canvas background (black or white), line thickness and style, fill, <span class=\"m-control\">Undo</span>, <span class=\"m-control\">Redo</span>, <span class=\"m-control\"><i data-icon=\"duplicate\"></i>Duplicate</span>, <span class=\"m-control\">Clear</span> and <span class=\"m-control\"><i data-icon=\"eye\"></i>Preview</span> — which shows how the logo will look on the Display.</p>\n<p class=\"m-p\">Keyboard shortcuts do not work while you are typing text.</p>\n<h2 class=\"m-h2\" id=\"s-8-4\"><span class=\"m-num\">8.4</span> Creating a logo from an image</h2>\n<ol class=\"m-ol\"><li>Click the &quot;New logo from image&quot; tile and choose <span class=\"m-control\"><i data-icon=\"folder\"></i>Choose image</span> — a JPG, PNG, GIF or WEBP file, up to 5 MB.</li><li>Set the crop: the &quot;Display area&quot; frame shows the part of the image that will appear on the screen. You can rotate the image by 90° and straighten it.</li><li>Adjust the look with the sliders: brightness, contrast, gamma, black, white and dither (the graininess of tonal transitions). <span class=\"m-control\">Invert</span> swaps light and dark areas, <span class=\"m-control\"><i data-icon=\"restore\"></i>Reset</span> undoes the settings.</li></ol>\n<p class=\"m-p\">The image will be turned into Display dots. On the host screen it can appear in its original form (→ <a class=\"m-ref\" href=\"?ch=8#s-8-5\">8.5</a>).</p>\n<h2 class=\"m-h2\" id=\"s-8-5\"><span class=\"m-num\">8.5</span> Saving, choosing and displaying a logo</h2>\n<p class=\"m-p\"><strong>Saving.</strong> The logo saves itself while you work — there is no &quot;Save&quot; button. Changes are also saved when you leave with the <span class=\"m-control\"><i data-icon=\"arrow-left\"></i>Back</span> button.</p>\n<p class=\"m-p\"><strong>The &quot;My logos&quot; list.</strong> For the selected logo, <span class=\"m-control\"><i data-icon=\"edit-paper\"></i>Edit</span>, <span class=\"m-control\"><i data-icon=\"eye\"></i>Preview</span>, <span class=\"m-control\"><i data-icon=\"duplicate\"></i>Duplicate</span>, export to a <code class=\"m-code\">.famlogo</code> file, <span class=\"m-control\"><i data-icon=\"upload\"></i>Import</span> and <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Send</span> — a copy for a friend (→ <a class=\"m-ref\" href=\"?ch=11#s-11-3\">11.3</a>) — are available. You rename a logo by double-clicking it (on touch screens — by pressing and holding), and delete it with the trash icon.</p>\n<p class=\"m-p\"><strong>Choosing a logo in a game.</strong> You choose the logo in <span class=\"m-page\">Game settings</span>, in the &quot;Logo&quot; section — &quot;Default&quot; or one of yours (→ <a class=\"m-ref\" href=\"?ch=16#s-16-3\">16.3</a>).</p>\n<p class=\"m-p\"><strong>How the logo looks during a game:</strong></p>\n<ul class=\"m-ul\"><li><strong>The Display</strong> always shows the logo made of dots, because it is a dot screen.</li><li><strong>The host screen</strong> — depending on the &quot;Host logo&quot; setting (→ <a class=\"m-ref\" href=\"?ch=16#s-16-3\">16.3</a>):<ul class=\"m-ul\"><li>&quot;Pixels&quot; — the same as the Display,</li><li>&quot;Source&quot; — a text logo as a caption in the style of the Familiada logo, a logo from an image as the original image, a drawn logo as a smooth drawing in the dot color.</li></ul></li></ul>\n<p class=\"m-p\">The logo appears at the start of the game, and at the end if you set the end screen that way (→ <a class=\"m-ref\" href=\"?ch=16#s-16-6\">16.6</a>, <a class=\"m-ref\" href=\"?ch=17#s-17-5\">17.5</a>).</p>\n<p class=\"m-p\"><strong>Locks.</strong> Editing a logo and playing a game exclude each other: while you are editing a logo, you cannot open the control panel or game settings, and during a game or while game settings are open you cannot edit or delete a logo. The app will show the reason — finish one activity and go back to the other.</p>"
  },
  {
   "id": "9",
   "title": "Question bases",
   "sections": [
    {
     "id": "9.1",
     "title": "What a question base is for",
     "level": 2
    },
    {
     "id": "9.2",
     "title": "The base explorer",
     "level": 2
    },
    {
     "id": "9.3",
     "title": "Tools for working with questions and folders",
     "level": 2
    },
    {
     "id": "9.4",
     "title": "Folders and tags",
     "level": 2
    },
    {
     "id": "9.5",
     "title": "Searching and browsing questions",
     "level": 2
    },
    {
     "id": "9.6",
     "title": "Keyboard shortcuts",
     "level": 2
    },
    {
     "id": "9.7",
     "title": "Editing a question",
     "level": 2
    },
    {
     "id": "9.8",
     "title": "Creating a game from selected questions",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-9-1\"><span class=\"m-num\">9.1</span> What a question base is for</h2>\n<p class=\"m-p\">A question base is your library of questions to use again and again. It is not a ready game: you can create a game from selected questions in the base at any time (→ <a class=\"m-ref\" href=\"?ch=9#s-9-8\">9.8</a>).</p>\n<p class=\"m-p\">The <span class=\"m-page\">Question bases</span> page has the &quot;My bases&quot; and &quot;Shared&quot; tabs — bases that other people invited you to (→ <a class=\"m-ref\" href=\"?ch=12\">12</a>). The filter above the list shows bases by role: Mine, Edit or Read-only.</p>\n<ul class=\"m-ul\"><li>To create a base, click the &quot;New base&quot; tile and enter a name (up to 80 characters).</li><li>To open a base, select it and choose <span class=\"m-control\"><i data-icon=\"folder\"></i>Browse</span>.</li><li>For the selected base, <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Share</span> (→ <a class=\"m-ref\" href=\"?ch=12#s-12-2\">12.2</a>), <span class=\"m-control\"><i data-icon=\"duplicate\"></i>Duplicate</span>, <span class=\"m-control\"><i data-icon=\"download\"></i>Export</span> to a <code class=\"m-code\">.fambase</code> file and <span class=\"m-control\"><i data-icon=\"upload\"></i>Import</span> from a file are also available.</li><li>You rename a base by double-clicking it, and delete it with the trash icon — only in your own bases.</li></ul>\n<p class=\"m-p\">You can move questions from a game to a base with the <span class=\"m-control\"><i data-icon=\"drawer-export\"></i>Export to base</span> button in <span class=\"m-page\">My games</span> (→ <a class=\"m-ref\" href=\"?ch=6#s-6-7\">6.7</a>).</p>\n<h2 class=\"m-h2\" id=\"s-9-2\"><span class=\"m-num\">9.2</span> The base explorer</h2>\n<p class=\"m-p\">An open base works much like a file explorer on a computer:</p>\n<ul class=\"m-ul\"><li><strong>on the left</strong> — the &quot;Folders&quot; tree, starting from the &quot;Root folder&quot;, and below it the &quot;Tags&quot; and &quot;Matching categories&quot; panels,</li><li><strong>in the middle</strong> — the contents of the current folder: folders and questions,</li><li><strong>at the top</strong> — the toolbar and the search field.</li></ul>\n<p class=\"m-p\">Click an item to select it. To select several, hold Ctrl (⌘ on a Mac); Shift selects a range. You can also select items with a frame by dragging from an empty spot. The right mouse button (on touch screens — press and hold) opens a menu with actions for the selection.</p>\n<p class=\"m-p\">You open a folder by double-clicking it or with the Enter key, and go up a level with the Backspace key or in the folder tree.</p>\n<h2 class=\"m-h2\" id=\"s-9-3\"><span class=\"m-num\">9.3</span> Tools for working with questions and folders</h2>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Action</th><th>What it does</th></tr></thead><tbody><tr><td><span class=\"m-control\">New folder</span>, <span class=\"m-control\">New question</span></td><td>creates an item in the current folder</td></tr><tr><td><span class=\"m-control\">Edit question</span></td><td>opens the question window (→ <a class=\"m-ref\" href=\"?ch=9#s-9-7\">9.7</a>)</td></tr><tr><td><span class=\"m-control\">Tags</span></td><td>assigns tags to the selection (→ <a class=\"m-ref\" href=\"?ch=9#s-9-4\">9.4</a>)</td></tr><tr><td><span class=\"m-control\">Rename</span></td><td>renames a folder or changes the question text</td></tr><tr><td><span class=\"m-control\"><i data-icon=\"copy\"></i>Copy</span>, <span class=\"m-control\">Cut</span>, <span class=\"m-control\">Paste</span></td><td>moves or copies the selection to another folder</td></tr><tr><td><span class=\"m-control\"><i data-icon=\"duplicate\"></i>Duplicate</span></td><td>creates a copy next to the original</td></tr><tr><td><span class=\"m-control\">Delete</span></td><td>deletes the selection — after confirmation, with no way to undo</td></tr><tr><td><span class=\"m-control\">Create game</span></td><td>creates a game from the selected questions (→ <a class=\"m-ref\" href=\"?ch=9#s-9-8\">9.8</a>)</td></tr><tr><td><span class=\"m-control\">Refresh view</span></td><td>shows the latest state of the base</td></tr></tbody></table></div>\n<p class=\"m-p\"><strong>Dragging.</strong> Drag the selection onto a folder to move it. With Ctrl held down (Option on a Mac) the items will be copied — a folder together with its contents. Dropping onto an empty background moves the items to the &quot;Root folder&quot;. Dragging onto a tag in the left panel assigns that tag.</p>\n<p class=\"m-p\">Deleting a folder also deletes everything inside it.</p>\n<h2 class=\"m-h2\" id=\"s-9-4\"><span class=\"m-num\">9.4</span> Folders and tags</h2>\n<p class=\"m-p\"><strong>Folders</strong> can be nested as deep as you like, and you can organize questions in them by topic, round or event.</p>\n<p class=\"m-p\"><strong>Tags</strong> are labels independent of folders — one question can have several tags, for example &quot;sport&quot; and &quot;easy&quot;.</p>\n<ul class=\"m-ul\"><li>In the <span class=\"m-control\">Tags</span> window, choose <span class=\"m-control\"><i data-icon=\"plus\"></i>Add tag</span>, enter a name (up to 40 characters: letters, digits and <code class=\"m-code\">_</code>, no spaces) and choose a color.</li><li>Select questions or folders, and in the <span class=\"m-control\">Tags</span> window tick the tags you want to assign to them. A tag marked as &quot;partial&quot; is on only some of the selected items.</li><li>Click a tag in the left panel to see only the questions with that tag. Several selected tags show the questions that have all of them.</li></ul>\n<p class=\"m-p\">The &quot;Matching categories&quot; under the tags are created by the app itself — they show the questions that already meet the conditions of a given game type (→ <a class=\"m-ref\" href=\"?ch=7#s-7-6\">7.6</a>):</p>\n<ul class=\"m-ul\"><li><strong>standard</strong> — suitable for a standard poll,</li><li><strong>scored</strong> — they have from 3 to 6 answers, so they are suitable for a &quot;Points&quot; game,</li><li><strong>prepared</strong> — they have from 3 to 6 answers with points (each at least 4, a total of at most 100), so they are suitable for a prepared game.</li></ul>\n<h2 class=\"m-h2\" id=\"s-9-5\"><span class=\"m-num\">9.5</span> Searching and browsing questions</h2>\n<p class=\"m-p\">Type text in the &quot;Search...&quot; field. The app will find questions and folders whose text or name contains that text (upper and lower case do not matter; answers are not searched). Type <code class=\"m-code\">#tag_name</code> to add a tag to the search.</p>\n<p class=\"m-p\">When you search or filter by tag, the list shows results from the whole base, not the contents of a folder — in this view you cannot paste or cut. To go back to the folders, clear the search field or deselect the tags.</p>\n<h2 class=\"m-h2\" id=\"s-9-6\"><span class=\"m-num\">9.6</span> Keyboard shortcuts</h2>\n<p class=\"m-p\">Shortcuts do not work while you are typing text in fields.</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Action</th><th>Windows / Linux</th><th>macOS</th></tr></thead><tbody><tr><td>New question</td><td>Ctrl+N</td><td>⌘N</td></tr><tr><td>New folder</td><td>Ctrl+Shift+N</td><td>⌘⇧N</td></tr><tr><td>Edit question</td><td>Ctrl+E</td><td>⌘E</td></tr><tr><td>Tags</td><td>Ctrl+T</td><td>⌘T</td></tr><tr><td>Rename</td><td>F2</td><td>F2</td></tr><tr><td>Delete</td><td>Delete</td><td>Fn+⌫</td></tr><tr><td>Copy / Cut / Paste</td><td>Ctrl+C / Ctrl+X / Ctrl+V</td><td>⌘C / ⌘X / ⌘V</td></tr><tr><td>Duplicate</td><td>Ctrl+D</td><td>⌘D</td></tr><tr><td>Select all</td><td>Ctrl+A</td><td>⌘A</td></tr><tr><td>Open folder</td><td>Enter</td><td>Enter</td></tr><tr><td>Folder up</td><td>Backspace</td><td>⌫</td></tr><tr><td>Deselect</td><td>Esc</td><td>Esc</td></tr><tr><td>Refresh view</td><td>Ctrl+Alt+R</td><td>⌘⌥R</td></tr><tr><td>Create game</td><td>Ctrl+G</td><td>⌘G</td></tr></tbody></table></div>\n<p class=\"m-p\">Some browsers use some of these shortcuts themselves (for example Ctrl+N opens a new window). In that case, use the button on the toolbar.</p>\n<h2 class=\"m-h2\" id=\"s-9-7\"><span class=\"m-num\">9.7</span> Editing a question</h2>\n<p class=\"m-p\">Double-click a question or choose <span class=\"m-control\">Edit question</span>. In the &quot;Question&quot; window:</p>\n<ul class=\"m-ul\"><li>&quot;Question text&quot; — up to 100 characters,</li><li><span class=\"m-control\">+ Answer</span> — up to 6 answers, each up to 17 characters,</li><li>&quot;Points&quot; — optional, from 0 to 100 for each answer; a total of at most 100.</li></ul>\n<p class=\"m-p\">Points are not required in a base — they come in handy if the question becomes part of a prepared game. The same limits and characters apply in the game editor (→ <a class=\"m-ref\" href=\"?ch=7#s-7-3\">7.3</a>, <a class=\"m-ref\" href=\"?ch=7#s-7-4\">7.4</a>). You assign tags separately (→ <a class=\"m-ref\" href=\"?ch=9#s-9-4\">9.4</a>).</p>\n<h2 class=\"m-h2\" id=\"s-9-8\"><span class=\"m-num\">9.8</span> Creating a game from selected questions</h2>\n<ol class=\"m-ol\"><li>Select questions or folders and choose <span class=\"m-control\">Create game</span>.</li><li>In the &quot;Export game&quot; window, enter the game name and choose the type: standard poll, scored or prepared.</li><li>Check the list: the selected questions (including those from selected folders) are already chosen. You can add or deselect questions from the whole base.</li><li>For each question and in the summary you can see what is missing for readiness — for example &quot;Ready once created.&quot; or &quot;A draft will be created. Missing for ready: …&quot;.</li><li>Confirm. The game will appear in <span class=\"m-page\">My games</span>.</li></ol>\n<p class=\"m-p\">The game is created from exactly the selected questions — the app does not add missing ones. It does not have to meet the readiness conditions: you can create an incomplete draft and complete it in the editor (→ <a class=\"m-ref\" href=\"?ch=7#s-7-6\">7.6</a>).</p>\n<p class=\"m-p\">The chosen game type decides what gets carried over: a standard poll keeps only the questions, scored — questions and answers without points (the points will come from the poll), and a prepared game — questions, answers and points.</p>\n<p class=\"m-p\">You cannot create a game from a base you only have read-only access to (→ <a class=\"m-ref\" href=\"?ch=12#s-12-4\">12.4</a>).</p>"
  },
  {
   "id": "10",
   "title": "Friends and managing friendships",
   "sections": [
    {
     "id": "10.1",
     "title": "Who is a friend in the app",
     "level": 2
    },
    {
     "id": "10.2",
     "title": "Sending invitations",
     "level": 2
    },
    {
     "id": "10.3",
     "title": "Handling invitations and their statuses",
     "level": 2
    },
    {
     "id": "10.4",
     "title": "Managing your friends list",
     "level": 2
    },
    {
     "id": "10.5",
     "title": "What a friendship lets you do",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-10-1\"><span class=\"m-num\">10.1</span> Who is a friend in the app</h2>\n<p class=\"m-p\">A friend is another person with an account in the app whom you connected with through an invitation: one person sent it, the other accepted it. Both need a regular account with a confirmed email address — a guest cannot have friends.</p>\n<p class=\"m-p\">A friend is not the same as a subscriber. A subscriber has no account and only gets emails from you about polls and shared devices (→ <a class=\"m-ref\" href=\"?ch=14#s-14-1\">14.1</a>).</p>\n<h2 class=\"m-h2\" id=\"s-10-2\"><span class=\"m-num\">10.2</span> Sending invitations</h2>\n<ol class=\"m-ol\"><li>Open the <span class=\"m-page\">Friends</span> page and the &quot;Invitations&quot; tab.</li><li>In the &quot;Add a friend&quot; section, enter the person's <strong>full</strong> email address or <strong>full</strong> username — the app does not suggest names.</li><li>Choose <span class=\"m-control\"><i data-icon=\"plus\"></i>Invite</span>.</li></ol>\n<p class=\"m-p\">The invitation appears in the &quot;Pending and declined&quot; section. If the invited person has notifications turned on, they get an email with an &quot;Open invitation&quot; button.</p>\n<p class=\"m-p\">If there is no account for that address, the app tells you so and offers to add the person as a subscriber (→ <a class=\"m-ref\" href=\"?ch=14#s-14-2\">14.2</a>). It also works the other way round: if you enter the address of a person with an account on the <span class=\"m-page\">Subscribers</span> page, the app offers to invite them as a friend.</p>\n<h2 class=\"m-h2\" id=\"s-10-3\"><span class=\"m-num\">10.3</span> Handling invitations and their statuses</h2>\n<p class=\"m-p\"><strong>Received invitations</strong> are in the &quot;Friends&quot; tab, in the &quot;Suggestions&quot; section:</p>\n<ul class=\"m-ul\"><li><span class=\"m-control\"><i data-icon=\"check\"></i>Accept</span> — the person is added to your friends list,</li><li><span class=\"m-control\"><i data-icon=\"close\"></i>Decline</span> — the invitation moves to the collapsed &quot;Declined by me&quot; section. For 30 days you can bring it back with the <span class=\"m-control\">Undo decline</span> button and then accept it.</li></ul>\n<p class=\"m-p\"><strong>Sent invitations</strong> are in the &quot;Invitations&quot; tab, in the &quot;Pending and declined&quot; section:</p>\n<ul class=\"m-ul\"><li>pending — you can <span class=\"m-control\"><i data-icon=\"refresh\"></i>Resend</span> them (once the required waiting time has passed) or <span class=\"m-control\">Withdraw</span> them,</li><li>declined — you can only <span class=\"m-control\">Withdraw</span> them.</li></ul>\n<p class=\"m-p\">After an invitation is declined, neither of the two people can invite the other for 30 days. Invitation emails are sent no more often than every 5 days and at most twice in 30 days.</p>\n<p class=\"m-p\">On a computer, both tabs are shown side by side; on a phone, you switch between them at the top. The counters next to the tabs show pending invitations.</p>\n<h2 class=\"m-h2\" id=\"s-10-4\"><span class=\"m-num\">10.4</span> Managing your friends list</h2>\n<p class=\"m-p\">Your friends list is in the &quot;Friends&quot; tab. Each person is shown with their name and email address.</p>\n<p class=\"m-p\">To remove a friend, choose <span class=\"m-control\">Remove</span> and confirm. Then:</p>\n<ul class=\"m-ul\"><li>the person disappears from the list and moves to &quot;Declined by me&quot; — for 30 days you can undo this with <span class=\"m-control\">Undo decline</span>,</li><li>pending poll and question base invitations between the two of you are cancelled,</li><li><strong>bases and devices you have already shared stay shared</strong> — revoke access to them separately (→ <a class=\"m-ref\" href=\"?ch=12#s-12-5\">12.5</a>, <a class=\"m-ref\" href=\"?ch=17#s-17-1\">17.1</a>),</li><li>copies of games and logos you have already sent stay with that person — a sent copy cannot be taken back (→ <a class=\"m-ref\" href=\"?ch=11\">11</a>).</li></ul>\n<h2 class=\"m-h2\" id=\"s-10-5\"><span class=\"m-num\">10.5</span> What a friendship lets you do</h2>\n<p class=\"m-p\">With friends you can:</p>\n<ul class=\"m-ul\"><li>invite them to polls (→ <a class=\"m-ref\" href=\"?ch=15#s-15-2\">15.2</a>),</li><li>send them copies of games and logos (→ <a class=\"m-ref\" href=\"?ch=11\">11</a>) — friends only,</li><li>quickly pick them from a list when sharing bases (→ <a class=\"m-ref\" href=\"?ch=12#s-12-2\">12.2</a>) and devices (→ <a class=\"m-ref\" href=\"?ch=17#s-17-1\">17.1</a>).</li></ul>\n<p class=\"m-p\">You can also share a base or a device with someone who is not your friend by entering their email address or username.</p>"
  },
  {
   "id": "11",
   "title": "Sending games and logos to friends",
   "sections": [
    {
     "id": "11.1",
     "title": "What sending a copy means",
     "level": 2
    },
    {
     "id": "11.2",
     "title": "Sending a game",
     "level": 2
    },
    {
     "id": "11.3",
     "title": "Sending a logo",
     "level": 2
    },
    {
     "id": "11.4",
     "title": "Receiving copies",
     "level": 2
    },
    {
     "id": "11.5",
     "title": "Send history",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-11-1\"><span class=\"m-num\">11.1</span> What sending a copy means</h2>\n<p class=\"m-p\">Your friend gets <strong>their own copy</strong> of the game or logo. They have no access to your original: their changes will not change your game, and your changes will not change their copy. A sent copy <strong>cannot be taken back</strong>.</p>\n<p class=\"m-p\">How sending differs from other ways of passing things on:</p>\n<ul class=\"m-ul\"><li><span class=\"m-control\"><i data-icon=\"duplicate\"></i>Duplicate</span> makes a copy for you (→ <a class=\"m-ref\" href=\"?ch=6#s-6-6\">6.6</a>),</li><li>exporting to a file gives you a file you can pass on to anyone (→ <a class=\"m-ref\" href=\"?ch=6#s-6-7\">6.7</a>),</li><li>Community Games is a public catalogue for everyone (→ <a class=\"m-ref\" href=\"?ch=13\">13</a>).</li></ul>\n<p class=\"m-p\">Sending requires an account and at least one friend.</p>\n<h2 class=\"m-h2\" id=\"s-11-2\"><span class=\"m-num\">11.2</span> Sending a game</h2>\n<ol class=\"m-ol\"><li>In <span class=\"m-page\">My games</span>, select a game and choose <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Send</span>.</li><li>In the &quot;Send to friends&quot; window, select friends.</li><li>Choose <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Send</span>. The app confirms: &quot;Sent to friends: …&quot;.</li></ol>\n<p class=\"m-p\">The copy keeps the game type and all its content. You can send:</p>\n<ul class=\"m-ul\"><li>a prepared game — in any state,</li><li>a poll game — only as a <strong>draft</strong>, without poll results; a poll that is open, stopped or closed cannot be sent.</li></ul>\n<p class=\"m-p\">You cannot send games added from Community Games, demo materials, or a game that is currently open in the editor or in settings.</p>\n<h2 class=\"m-h2\" id=\"s-11-3\"><span class=\"m-num\">11.3</span> Sending a logo</h2>\n<p class=\"m-p\">On the <span class=\"m-page\">My logos</span> page, select a logo, choose <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Send</span> and continue as for a game. Your friend can use the logo they receive in their own games (→ <a class=\"m-ref\" href=\"?ch=8#s-8-5\">8.5</a>). Demo logos cannot be sent.</p>\n<h2 class=\"m-h2\" id=\"s-11-4\"><span class=\"m-num\">11.4</span> Receiving copies</h2>\n<p class=\"m-p\">When someone sends you a copy, you get an email &quot;… sent you a copy&quot; (if you have notifications turned on), and a counter appears next to the <span class=\"m-page\">My games</span> or <span class=\"m-page\">My logos</span> tab.</p>\n<p class=\"m-p\">The copy waits in the &quot;Received copies&quot; section — with its name and a &quot;From: …&quot; label:</p>\n<ul class=\"m-ul\"><li><span class=\"m-control\"><i data-icon=\"check\"></i>Accept</span> — the copy goes into your library: a game into the tab for its type, a logo into <span class=\"m-page\">My logos</span>. It keeps the &quot;From: …&quot; label, and in <span class=\"m-page\">My games</span> you can also find it with the &quot;Received&quot; filter.</li><li><span class=\"m-control\"><i data-icon=\"close\"></i>Decline</span> — the copy disappears. The same person cannot send it to you again for 30 days.</li></ul>\n<p class=\"m-p\">A copy you do not accept within <strong>5 days</strong> disappears. While it waits for your decision, it cannot be edited, duplicated or deleted.</p>\n<h2 class=\"m-h2\" id=\"s-11-5\"><span class=\"m-num\">11.5</span> Send history</h2>\n<p class=\"m-p\">In the &quot;Send to friends&quot; window, expand the &quot;Send history&quot; section. You can see who you sent copies to, and when, over the last 30 days. The history is for viewing only — it does not show whether a copy was accepted, and it does not let you take back a sent copy.</p>"
  },
  {
   "id": "12",
   "title": "Sharing and editing question bases together",
   "sections": [
    {
     "id": "12.1",
     "title": "How sharing a base works",
     "level": 2
    },
    {
     "id": "12.2",
     "title": "Inviting people to a base",
     "level": 2
    },
    {
     "id": "12.3",
     "title": "Accepting an invitation and opening a base",
     "level": 2
    },
    {
     "id": "12.4",
     "title": "Access levels",
     "level": 2
    },
    {
     "id": "12.5",
     "title": "Working together and managing access",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-12-1\"><span class=\"m-num\">12.1</span> How sharing a base works</h2>\n<p class=\"m-p\">A shared base is <strong>one and the same for everyone</strong> who has access to it: changes made by one person are seen by the others. This is different from sending a copy of a game or logo, where everyone gets their own, independent copy (→ <a class=\"m-ref\" href=\"?ch=11\">11</a>).</p>\n<p class=\"m-p\">A base is shared by its owner; this requires an account (→ <a class=\"m-ref\" href=\"?ch=5#s-5-1\">5.1</a>).</p>\n<h2 class=\"m-h2\" id=\"s-12-2\"><span class=\"m-num\">12.2</span> Inviting people to a base</h2>\n<ol class=\"m-ol\"><li>On the <span class=\"m-page\">Question bases</span> page, select your base and choose <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Share</span>.</li><li>Choose the access level: &quot;Can edit&quot; (the default) or &quot;View only&quot;.</li><li>Enter an email address or username and choose <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Share</span> — or select people in the &quot;Friends&quot; list and choose <span class=\"m-control\"><i data-icon=\"people\"></i>Share with selected</span>.</li></ol>\n<p class=\"m-p\">The invited person does not have to be your friend, but they must have an account. If they have notifications turned on, they get an email with a link.</p>\n<h2 class=\"m-h2\" id=\"s-12-3\"><span class=\"m-num\">12.3</span> Accepting an invitation and opening a base</h2>\n<p class=\"m-p\">You will see the invitation on the <span class=\"m-page\">Question bases</span> page, in the &quot;Shared&quot; tab — as a &quot;Proposed&quot; tile with a &quot;From: …&quot; label. The counter next to the tab shows the number of invitations.</p>\n<ul class=\"m-ul\"><li><span class=\"m-control\"><i data-icon=\"check\"></i>Accept</span> — the base stays in the &quot;Shared&quot; tab; you open it with the <span class=\"m-control\"><i data-icon=\"arrow-left\"></i>Browse</span> button.</li><li><span class=\"m-control\"><i data-icon=\"close\"></i>Decline</span> — the invitation disappears. You can undo the decline in the declined section.</li></ul>\n<p class=\"m-p\">An invitation that is not accepted expires after <strong>5 days</strong>.</p>\n<h2 class=\"m-h2\" id=\"s-12-4\"><span class=\"m-num\">12.4</span> Access levels</h2>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Who</th><th>Label</th><th>What they can do</th></tr></thead><tbody><tr><td>Owner</td><td>&quot;Mine&quot;</td><td>everything: edit, share, rename, <span class=\"m-control\"><i data-icon=\"duplicate\"></i>Duplicate</span> and delete the base</td></tr><tr><td>Edit</td><td>&quot;EDIT&quot;</td><td>add, change, move and delete questions, folders and tags; create games from them; export questions from games into this base (→ <a class=\"m-ref\" href=\"?ch=6#s-6-7\">6.7</a>)</td></tr><tr><td>Read</td><td>&quot;READ&quot;</td><td>browse the base and export it to a file</td></tr></tbody></table></div>\n<p class=\"m-p\">A person with read access cannot create a game directly from the base. They can export the base to a file, import it as their own (→ <a class=\"m-ref\" href=\"?ch=9#s-9-1\">9.1</a>) and create a game there.</p>\n<p class=\"m-p\">How to work with questions → <a class=\"m-ref\" href=\"?ch=9\">9</a>.</p>\n<h2 class=\"m-h2\" id=\"s-12-5\"><span class=\"m-num\">12.5</span> Working together and managing access</h2>\n<p class=\"m-p\"><strong>Editing together.</strong> When someone is editing a question, folder or tag, that item is busy for a moment. If you try to change it at the same time, you will see the message &quot;This database item is currently being edited in another tab or by another user.&quot; Wait a moment and try again. While someone has the base open, the owner cannot rename or delete it.</p>\n<p class=\"m-p\"><strong>Managing access (owner).</strong> In the <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Share</span> window, in the &quot;Shared with&quot; section, you can see pending, accepted and declined invitations. You can:</p>\n<ul class=\"m-ul\"><li>change the access level, even before the invitation is accepted,</li><li>send a reminder about a pending invitation,</li><li>revoke access or cancel an invitation.</li></ul>\n<p class=\"m-p\">A person whose access is revoked loses it immediately — if they have the base open, they will see the message &quot;Access revoked&quot;. You can also leave a base shared with you yourself with the <span class=\"m-control\">Remove from list</span> button.</p>\n<p class=\"m-p\">Removing someone from your friends does not revoke their access to bases — do that separately (→ <a class=\"m-ref\" href=\"?ch=10#s-10-4\">10.4</a>).</p>"
  },
  {
   "id": "13",
   "title": "Community Games",
   "sections": [
    {
     "id": "13.1",
     "title": "What Community Games are",
     "level": 2
    },
    {
     "id": "13.2",
     "title": "Browsing and searching for games",
     "level": 2
    },
    {
     "id": "13.3",
     "title": "Game details and ratings",
     "level": 2
    },
    {
     "id": "13.4",
     "title": "Adding a game to your library and playing it",
     "level": 2
    },
    {
     "id": "13.5",
     "title": "Submitting your own game",
     "level": 2
    },
    {
     "id": "13.6",
     "title": "Submission status and withdrawing a game",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-13-1\"><span class=\"m-num\">13.1</span> What Community Games are</h2>\n<p class=\"m-p\">Community Games is a public catalogue of ready-made games, prepared by users and by Familiada. When you add a game to your library, you get <strong>your own copy to play</strong> — not shared access to the author's game. This is different from sending a copy to a friend (→ <a class=\"m-ref\" href=\"?ch=11\">11</a>).</p>\n<h2 class=\"m-h2\" id=\"s-13-2\"><span class=\"m-num\">13.2</span> Browsing and searching for games</h2>\n<p class=\"m-p\">On the <span class=\"m-page\">Community Games</span> page:</p>\n<ul class=\"m-ul\"><li>&quot;Search games…&quot; — searches titles and descriptions,</li><li>&quot;Language&quot; — All, Polish, English or Ukrainian,</li><li>&quot;Sort&quot; — Recommended, Top rated, Most added, Newest, Title A–Z.</li></ul>\n<p class=\"m-p\"><span class=\"m-control\"><i data-icon=\"arrow-down\"></i>Load more</span> shows more games.</p>\n<p class=\"m-p\">A game card shows the language, the title, the author (&quot;by: …&quot;) or a gold &quot;Familiada&quot; label for games prepared by the app, the description, how many times it was added and the average rating (or &quot;No ratings yet&quot;). The &quot;In your games&quot; label means the game is already in your library.</p>\n<h2 class=\"m-h2\" id=\"s-13-3\"><span class=\"m-num\">13.3</span> Game details and ratings</h2>\n<p class=\"m-p\">Click a card to open the details: the description and all the questions with their answers and points. You can look through them before adding the game.</p>\n<p class=\"m-p\">A signed-in user can rate a game from 1 to 5 stars (&quot;Rate this game:&quot;) and change the rating later. You cannot rate your own game. For recommendations, the app only takes the average into account once a game has three ratings.</p>\n<h2 class=\"m-h2\" id=\"s-13-4\"><span class=\"m-num\">13.4</span> Adding a game to your library and playing it</h2>\n<ol class=\"m-ol\"><li>In the game details, choose <span class=\"m-control\"><i data-icon=\"plus\"></i>Add to my games</span>.</li><li>The game appears in <span class=\"m-page\">My games</span>, in the &quot;Community Games&quot; tab.</li><li>Select it and choose <span class=\"m-control\"><i data-icon=\"gamepad\"></i>Play</span> (→ <a class=\"m-ref\" href=\"?ch=17\">17</a>). You can also change its <span class=\"m-control\"><i data-icon=\"settings\"></i>Game settings</span> (→ <a class=\"m-ref\" href=\"?ch=16\">16</a>).</li></ol>\n<p class=\"m-p\">A Community game cannot be edited, have its type changed, be duplicated, exported or sent.</p>\n<p class=\"m-p\">To remove a game from your library, choose <span class=\"m-control\"><i data-icon=\"trash\"></i>Remove from my games</span> in the details, or the bin icon on the tile (&quot;Remove from library&quot;). You only remove your own copy — other people who added this game still have it.</p>\n<h2 class=\"m-h2\" id=\"s-13-5\"><span class=\"m-num\">13.5</span> Submitting your own game</h2>\n<ol class=\"m-ol\"><li>On the <span class=\"m-page\">Community Games</span> page, open &quot;My submissions&quot; and choose <span class=\"m-control\"><i data-icon=\"plus\"></i>Submit a new game</span>.</li><li>Choose a game, enter a title (up to 120 characters) and a description (up to 500 characters), and select the game's language.</li><li>Tick &quot;I understand the snapshot is immutable after submission.&quot; and choose <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Submit to Community Games</span>.</li></ol>\n<p class=\"m-p\">You can submit your own game that is <strong>ready to play</strong> (→ <a class=\"m-ref\" href=\"?ch=7#s-7-6\">7.6</a>): a prepared game or a game with a closed poll. Demo games and Community games cannot be submitted. A game can have only one submission at a time.</p>\n<p class=\"m-p\">A submission is <strong>a snapshot of the game at the moment you send it</strong> — later changes to your game will not change it. A game from a closed poll goes into the catalogue as a game with ready-made answers and points.</p>\n<h2 class=\"m-h2\" id=\"s-13-6\"><span class=\"m-num\">13.6</span> Submission status and withdrawing a game</h2>\n<p class=\"m-p\">In &quot;My submissions&quot; you can see the status of each submission:</p>\n<div class=\"m-table-wrap\"><table class=\"m-table\"><thead><tr><th>Status</th><th>What it means</th></tr></thead><tbody><tr><td>Awaiting review</td><td>The submission is waiting to be checked.</td></tr><tr><td>Published</td><td>The game is in the catalogue.</td></tr><tr><td>Rejected</td><td>The game was not accepted; the reason is shown with the submission (&quot;Reason: …&quot;). A rejected submission disappears after 5 days; you can improve the game and submit it again.</td></tr></tbody></table></div>\n<p class=\"m-p\">You can <span class=\"m-control\">Withdraw</span> a published game. It disappears from the catalogue for new people, but those who have already added it still have it — with a &quot;Withdrawn&quot; label.</p>"
  },
  {
   "id": "14",
   "title": "Subscribers and email notifications",
   "sections": [
    {
     "id": "14.1",
     "title": "Who is a subscriber?",
     "level": 2
    },
    {
     "id": "14.2",
     "title": "Inviting subscribers",
     "level": 2
    },
    {
     "id": "14.3",
     "title": "Subscriber list and statuses",
     "level": 2
    },
    {
     "id": "14.4",
     "title": "Poll notifications",
     "level": 2
    },
    {
     "id": "14.5",
     "title": "The \"My notifications\" page and managing your own subscriptions",
     "level": 2
    }
   ],
   "html": "\n<h2 class=\"m-h2\" id=\"s-14-1\"><span class=\"m-num\">14.1</span> Who is a subscriber?</h2>\n<p class=\"m-p\">A subscriber is a person <strong>without an account</strong> in the app whom you add by email address so that you can invite them to polls. A subscriber:</p>\n<ul class=\"m-ul\"><li>gets emails from you about polls and shared devices,</li><li>answers polls and connects devices without signing in,</li><li>manages their emails on the <span class=\"m-page\">My notifications</span> page (→ <a class=\"m-ref\" href=\"?ch=14#s-14-5\">14.5</a>).</li></ul>\n<p class=\"m-p\">You add people who have an account as friends (→ <a class=\"m-ref\" href=\"?ch=10\">10</a>). When a subscriber creates an account, their address shows &quot;Has an account — go to Friends.&quot;, and you get a friend suggestion from them.</p>\n<h2 class=\"m-h2\" id=\"s-14-2\"><span class=\"m-num\">14.2</span> Inviting subscribers</h2>\n<ol class=\"m-ol\"><li>Open the <span class=\"m-page\">Subscribers</span> page and the &quot;Invitations&quot; tab.</li><li>Enter an email address and choose <span class=\"m-control\"><i data-icon=\"plus\"></i>Invite</span>.</li></ol>\n<p class=\"m-p\">An email &quot;Subscription invitation from …&quot; with a &quot;View invitation&quot; button is sent to that address. The recipient accepts or declines the invitation on the page the email leads to.</p>\n<p class=\"m-p\">You cannot invite an address that belongs to an account (the app will suggest a friendship instead), or an address whose owner has opted out of all emails. Invitation emails are sent no more often than every 5 days and at most twice in 30 days; after a decline, you can invite again only after 30 days.</p>\n<h2 class=\"m-h2\" id=\"s-14-3\"><span class=\"m-num\">14.3</span> Subscriber list and statuses</h2>\n<ul class=\"m-ul\"><li>&quot;Invitations&quot; tab, &quot;Pending and declined&quot; section: &quot;Pending&quot; — the invitation is waiting for an answer; &quot;Declined&quot; — the recipient said no (shown for 5 days).</li><li>&quot;Subscribers&quot; tab: people who have accepted the invitation.</li></ul>\n<p class=\"m-p\">For a pending invitation you can <span class=\"m-control\"><i data-icon=\"refresh\"></i>Resend</span>. <span class=\"m-control\">Remove</span> ends the subscription and deletes that person's pending invitations to your polls.</p>\n<h2 class=\"m-h2\" id=\"s-14-4\"><span class=\"m-num\">14.4</span> Poll notifications</h2>\n<p class=\"m-p\">You choose subscribers as poll recipients together with your friends (→ <a class=\"m-ref\" href=\"?ch=15#s-15-2\">15.2</a>). Each of them gets the email &quot;Voting invitation — …&quot; with a link to vote, and you can send a reminder. In the same way, a subscriber gets an email about a shared device (→ <a class=\"m-ref\" href=\"?ch=17#s-17-1\">17.1</a>).</p>\n<p class=\"m-p\">Every email has a &quot;My notifications&quot; link at the bottom and an option to unsubscribe from all Familiada emails.</p>\n<h2 class=\"m-h2\" id=\"s-14-5\"><span class=\"m-num\">14.5</span> The &quot;My notifications&quot; page and managing your own subscriptions</h2>\n<p class=\"m-p\">This page is for people who receive the emails, including those without an account.</p>\n<p class=\"m-p\"><strong>How to get there:</strong></p>\n<ul class=\"m-ul\"><li>click &quot;My notifications&quot; at the bottom of any email from Familiada (the link works for 30 days), or</li><li>open the <span class=\"m-page\">Your Familiada emails</span> page, enter your address and choose <span class=\"m-control\"><i data-icon=\"envelope-out\"></i>Send link</span>. You will get an email with a one-time link valid for 15 minutes; after clicking it, choose <span class=\"m-control\">Open my notifications</span>.</li></ul>\n<p class=\"m-p\">If the address belongs to an account, the app asks you to sign in — you then set your notifications in <span class=\"m-page\">Account settings</span> (→ <a class=\"m-ref\" href=\"?ch=5#s-5-8\">5.8</a>).</p>\n<p class=\"m-p\"><strong>What you will find here:</strong></p>\n<ul class=\"m-ul\"><li><strong>Subscriptions</strong> — who you can receive polls from. You accept pending ones with <span class=\"m-control\"><i data-icon=\"check\"></i>Accept</span> or decline them with <span class=\"m-control\"><i data-icon=\"close\"></i>Decline</span>; you leave an active one with <span class=\"m-control\">Unsubscribe</span> — that person will be able to invite you again only after 30 days.</li><li><strong>Tasks</strong> — polls waiting for your vote (<span class=\"m-control\">Vote</span>, <span class=\"m-control\"><i data-icon=\"close\"></i>Decline</span> → <a class=\"m-ref\" href=\"?ch=15#s-15-3\">15.3</a>), and devices shared with you (<span class=\"m-control\"><i data-icon=\"phone\"></i>Connect device</span> → <a class=\"m-ref\" href=\"?ch=17#s-17-1\">17.1</a>).</li><li><strong>&quot;Notifications are on&quot;</strong> — <span class=\"m-control\">Unsubscribe</span> turns off all emails: it cancels your subscriptions, pending polls and shared devices, and nobody will be able to invite you. If you turn notifications back on, the old invitations will not come back.</li></ul>\n<p class=\"m-p\">A visit to the page expires after an hour of inactivity — after that, come back in through the link.</p>"
  }
 ]
};

export default manual;
