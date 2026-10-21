// Treść podręcznika (EN) — ładowana tylko przez stronę /manual/, żeby nie
// obciążała tłumaczeń wszystkich stron. Kotwice rozdziałów: r<N>, r<N>-<M>.
export default {
  rules: `
<h2 class="m-ch" id="r1">1. What is Familiada?</h2>
<p class="m-p">Familiada is a game show in which two teams (traditionally families) try to guess what survey respondents said when asked about ordinary, everyday things. The winner is not the one who knows the "correct" answer, but the one who best predicts what most people will say. The board hides the most common answers, and next to each one is a number of points equal to the number of people who gave it.</p>
<p class="m-p">The game is played in rounds. Each round starts with a face-off between one player from each team, after which one team tries to uncover all the answers on the board. Wrong answers are marked as strikes, and after three strikes the opposing team gets a chance to steal the points collected so far. Points from the rounds add up to the team's score, and in later stages of the game they are multiplied.</p>
<p class="m-p">The first team to reach the required number of points goes through to the final. In the final, two players from that team answer a short series of questions against the clock and together play for the main prize. The detailed rules are set out in the regulations published by TVP: <a href="https://s.tvp.pl/repository/attachment/3/5/4/354f69c09c8b430588d3c079410afb3d.pdf" target="_blank" rel="noopener">Familiada game show regulations (TVP)</a> (in Polish). The following chapters explain these rules one by one and show how each of them works in the service.</p>

<h2 class="m-ch" id="r2">2. Survey questions and answers</h2>

<h3 class="m-h2" id="r2-1">2.1 Where the answers come from</h3>
<p class="m-p">Every question in Familiada was first asked to a group of survey respondents. Each of them gave their own answer, and the ones given most often make it into the game. That is why Familiada is not a quiz with one objectively correct answer: an answer can be funny, unexpected or even imprecise. All that matters is whether enough people gave it.</p>

<h3 class="m-h2" id="r2-2">2.2 How to read the board</h3>
<p class="m-p">On the show, the survey covers <span class="m-strong">100 people</span>. The number of points next to an answer is the number of respondents who gave it: an answer worth 32 points was given by 32 people out of a hundred. Answers on the board are ordered by popularity, with the most common at the top and less common ones below.</p>
<p class="m-p">The board does not show every answer given in the survey. The regulations show by example that answers given only 1, 2 or 3 times are left out of the final list. That is why the points on the board usually add up to less than 100.</p>

<h3 class="m-h2" id="r2-3">2.3 What counts as an answer that matches the board</h3>
<p class="m-p">The team's task is to guess the answers that made it onto the list. An answer "matches" when it means the same as one of the entries on the board: it is then uncovered and its points go into the round's pool. An answer that is not on the list is a strike. How the following answers are decided and what happens after strikes is described in <a class="m-ref" href="#r3">chapter 3</a>.</p>

<h3 class="m-h2" id="r2-4">2.4 How the service uses survey results</h3>
<p class="m-p">In the service, you can collect the answers for your game in your own poll. The service does not require exactly 100 voters: there can be fewer or more, even several hundred, and there is no upper limit on the number of votes. Results are always scaled proportionally to 0–100, so that points mean the same as on the show: <span class="m-strong">an answer's points = its percentage share in the poll</span>.</p>
<p class="m-p">The service always goes from votes to the finished list of answers in the same order:</p>
<ol class="m-ol">
<li><span class="m-strong">Merging</span>: in a standard poll, identical answers (regardless of upper or lower case) are combined into one and their votes are added up. When counting votes, you can also merge answers yourself if they mean the same thing but were written differently.</li>
<li><span class="m-strong">Converting to percentages</span>: each answer's share is calculated against the number of completed polls and rounded down to a whole percent. An answer with at least one vote but less than 1% counts as 1%.</li>
<li><span class="m-strong">Qualifying</span>: an answer qualifies for the game if, after this rounding, it has <span class="m-strong">at least 4%</span>. Its points equal that percentage, so answers with the same number of votes get the same number of points. Answers below 4% get no points.</li>
<li><span class="m-strong">Limiting the list</span>: in a standard poll, at most <span class="m-strong">6</span> qualifying answers go into the game, starting from the most common. If several answers have the same number of votes at the sixth-place cut-off, you choose which of them go into the game. The list can also be shorter than six entries.</li>
</ol>
<p class="m-p">Example: 500 people took part in a poll. An answer given by 20 people has 4% and gets 4 points. An answer given by 19 people has 3.8%, which is 3% after rounding down, so it does not qualify.</p>
<p class="m-p">To close a poll, <span class="m-strong">at least three</span> answers must qualify in every question. The limit of six answers does not come from the show's regulations, but from the board on the <span class="m-page">Display</span>, which fits six entries. The service also does not require a different number of answers in different rounds: each question has as many answers as qualified.</p>
<div class="m-note"><p class="m-p">Voting, counting votes and merging answers are described step by step in <a class="m-ref" href="#r15">chapter 15</a>. You can also enter points manually in a prepared game; the rules for that scoring are described in <a class="m-ref" href="#r7-4">chapter 7.4</a>.</p></div>

<h2 class="m-ch" id="r3">3. How a round works and the face-off</h2>
<p class="m-p">This chapter describes how a round works according to the Familiada regulations. The basic order and mechanics of rounds in the service are modelled on them; where the service works differently or lets you change something, the difference is described in that section. Each round is played for one question.</p>

<h3 class="m-h2" id="r3-1">3.1 Round structure and extra rounds</h3>
<p class="m-p">On the show, three scheduled rounds are played. If no team has reached 300 points after them, an extra round follows: another round played by the same rules.</p>
<p class="m-p">In the service, additional questions do not form a separate extra-round stage. Each further question is an ordinary round, and the move to the final depends on the points threshold you set (see <a class="m-ref" href="#r3-7">3.7</a>).</p>

<h3 class="m-h2" id="r3-2">3.2 Scoring and the round multiplier</h3>
<p class="m-p">Points for uncovered answers go into a shared round pool called the bank. At the end of the round, one of the teams receives the bank. The <span class="m-strong">round multiplier</span> sets how many times the bank is multiplied before it is added to the team's score. This way, later rounds can be worth more and a team that is behind still has a chance to catch up.</p>
<p class="m-p">In the show's regulations, multipliers are tied to specific stages of the game. In the service, you set the sequence of multipliers for the rounds yourself in the <span class="m-strong">Round multipliers</span> option. The default is <span class="m-code">1, 1, 1, 2, 3</span>: the first three rounds count once, the fourth counts double and the fifth triple. The last value in the list applies to all later rounds.</p>
<div class="m-table-wrap"><table class="m-table"><thead><tr><th>Round</th><th>Bank</th><th>Multiplier (default)</th><th>Points for the team</th></tr></thead><tbody>
<tr><td>1</td><td>80</td><td>×1</td><td>80</td></tr>
<tr><td>4</td><td>80</td><td>×2</td><td>160</td></tr>
<tr><td>5</td><td>80</td><td>×3</td><td>240</td></tr>
<tr><td>6 and later</td><td>80</td><td>×3</td><td>240</td></tr>
</tbody></table></div>
<p class="m-p">How to set multipliers is described in <a class="m-ref" href="#r16-6">chapter 16.6</a>.</p>

<h3 class="m-h2" id="r3-3">3.3 The face-off at the start of a round</h3>
<p class="m-p">Every round starts with a face-off. One player from each team stands opposite the other and both hear the same question. The first to answer is whoever presses the button faster. If they name the top-scoring answer, their team takes control of the round straight away. Otherwise the other team's player answers, and control goes to the team whose answer is worth more points. Points for answers uncovered in the face-off go into the round's bank.</p>
<p class="m-p">In the service, the face-off works the same way:</p>
<ul class="m-ul">
<li>the order of buzzing in is decided by the <span class="m-page">Duel buzzer</span> or, with a physical button, by the operator, who selects the team manually;</li>
<li>any answer with the highest number of points counts as the top-scoring answer, even when several answers have the same score;</li>
<li>if both answers are worth the same, control goes to the team that answered first;</li>
<li>if both players are wrong, the face-off continues: the same team answers first again, without pressing the button again.</li>
</ul>
<p class="m-p">In the service, the team that won the face-off can <span class="m-strong">pass the question</span> to its opponents: once per round, right after the face-off, before giving its own first answer. Control then goes to the opposing team.</p>

<h3 class="m-h2" id="r3-4">3.4 Team answers</h3>
<p class="m-p">After the face-off, the team in control tries to uncover the remaining answers on the board. Team members answer in turn. Each correct answer is uncovered and its points increase the round's bank. The team keeps playing until it uncovers all the answers or gets three strikes.</p>

<h3 class="m-h2" id="r3-5">3.5 Strikes and stealing the points</h3>
<p class="m-p">A strike is an answer that is not on the board, or no answer within the time limit. Each strike of the team in control is marked on the board with an <span class="m-strong">X</span>.</p>
<p class="m-p">According to the regulations, a player must answer within <span class="m-strong">three seconds</span> of the end of the question being read out; when the time is up, an X appears on the board. The limit keeps the game moving and stops players from thinking for too long.</p>
<p class="m-p">In the service, the three-second countdown does not start on its own. The operator starts it when an answer is taking too long, and the host lets the players know that time is up. When the countdown ends, the service counts a strike exactly as if the operator had added an X manually, including in the face-off. Using the countdown is described in <a class="m-ref" href="#r17-3">chapter 17.3</a>.</p>
<p class="m-p">After the <span class="m-strong">third strike</span>, the team in control loses the round and the opposing team gets a chance to steal the bank. The opponents confer and give <span class="m-strong">one</span> answer:</p>
<ul class="m-ul">
<li>if it is on the board, the whole round bank (including the points for that answer) goes to them;</li>
<li>if it is not, the bank stays with the team that was in control of the round.</li>
</ul>

<h3 class="m-h2" id="r3-6">3.6 End of a round and checking the threshold</h3>
<p class="m-p">A round ends when the team in control uncovers all the answers (the bank goes to them) or after the opponents' attempt to steal (the bank goes to the team that won the steal). The bank, multiplied by the round multiplier, is added to the team's total score. Answers that remained covered can then be shown to the audience; they no longer give any points.</p>
<p class="m-p">After the round is settled, the teams' scores are checked. On the show, the team that reaches <span class="m-strong">300 points</span> goes through to the final; if nobody has 300 points after three rounds, an extra round is played. The threshold always applies to the <span class="m-strong">team's total score</span>, not to the multiplier or the number of uncovered answers.</p>

<h3 class="m-h2" id="r3-7">3.7 How the service handles it</h3>
<p class="m-p">In the service, you set the threshold in the <span class="m-strong">Points threshold for finale</span> option (default <span class="m-code">300</span>). The service checks it after each round is settled. It is enough for one team to reach it. Then:</p>
<ul class="m-ul">
<li>the game moves on to the <span class="m-strong">final</span> if the final is enabled and ready (when final questions are chosen manually, five questions must be selected and confirmed);</li>
<li>otherwise the game moves on to the <span class="m-strong">ending</span>.</li>
</ul>
<p class="m-p">The service does not impose a limit of three rounds and does not mark further rounds as extra rounds. The number of rounds depends on how many questions are available for rounds. The game can end without a final in two ways:</p>
<ul class="m-ul">
<li><span class="m-strong">Running out of questions</span>: if the round questions run out before either team reaches the threshold, the game ends without a final, even if the final is enabled.</li>
<li><span class="m-strong">The final is disabled</span>: if you choose <span class="m-btn">No</span> for <span class="m-strong">Does the game include a finale?</span> in the settings, the game ends after the rounds. If the end screen is set to show points, it shows the winning team's score from the rounds (in case of a tie, the logo).</li>
</ul>
<div class="m-note"><p class="m-p">Choose the number of questions and the threshold so that the questions do not run out before the planned final. Question and threshold settings are described in <a class="m-ref" href="#r16">chapter 16</a>, and how the <span class="m-page">Control panel</span> guides the operator through each stage of a round in <a class="m-ref" href="#r17">chapter 17</a>.</p></div>

<h2 class="m-ch" id="r4">4. The show's final</h2>

<h3 class="m-h2" id="r4-1">4.1 How the final works</h3>
<p class="m-p">The team that reached the points threshold goes through to the final. Two players from that team take part. Both answer the same <span class="m-strong">five questions</span>, but separately and with different time limits.</p>
<ol class="m-ol">
<li><span class="m-strong">Preparation.</span> The second finalist moves away from the first and puts on headphones with music, so they can neither hear nor see the first finalist's answers.</li>
<li><span class="m-strong">The first finalist</span> answers five questions in <span class="m-strong">15 seconds</span>. The host reads the questions one after another and the finalist quickly gives one answer to each.</li>
<li><span class="m-strong">Revealing the first finalist's answers.</span> The answers are shown one by one: first the answer itself, then the number of points it was worth in the survey. The points are immediately added to the shared final total.</li>
<li><span class="m-strong">The second finalist</span> comes back and answers the same five questions in <span class="m-strong">20 seconds</span>, knowing the first finalist's result. They cannot repeat the other finalist's answer: if they do, a buzzer sounds and they must give a different one.</li>
<li><span class="m-strong">Revealing the second finalist's answers</span>, in the same way as for the first: the answer, then the points, which are added to the same total.</li>
</ol>
<p class="m-p">In the service, the final works the same way: the 15- and 20-second times are fixed, and the operator starts the countdown. The operator types in the answers, then for each question matches the entry to an answer from the list and reveals the answer and its points. A repeated answer from the second finalist is marked separately and gives no points. The operator's work is described in detail in <a class="m-ref" href="#r17-4">chapter 17.4</a>.</p>

<h3 class="m-h2" id="r4-2">4.2 Final scoring and the final multiplier</h3>
<p class="m-p">The points of both finalists add up to one final score. On the show, final points count with a multiplier of <span class="m-strong">×1</span>: an answer worth 30 points adds exactly 30 to the total. The service works the same way: round multipliers do not apply to the final.</p>
<p class="m-p">Do not confuse this with the multiplier used to calculate the prize. It does not change the points scored in the final; it is only used to convert points into the prize amount (see <a class="m-ref" href="#r4-4">4.4</a>).</p>

<h3 class="m-h2" id="r4-3">4.3 The final points target and ending the game early</h3>
<p class="m-p">On the show, the goal of the final is to score a total of <span class="m-strong">at least 200 points</span> from both finalists' answers. Reaching the target means winning the main prize.</p>
<p class="m-p">In the service, you set the target in the <span class="m-strong">Finale target (pts)</span> option (default <span class="m-code">200</span>). The final ends:</p>
<ul class="m-ul">
<li><span class="m-strong">early</span>, when the total reaches the target you set; further answers are no longer scored, even if the first finalist reached the target alone;</li>
<li>or <span class="m-strong">after all final questions have been played</span> by both finalists, if the target was not reached.</li>
</ul>

<h3 class="m-h2" id="r4-4">4.4 The main prize and the final result</h3>
<p class="m-p">According to the regulations, once the final target is reached, the main prize of <span class="m-strong">25,000 zł</span> is added to the amount won earlier. If the target is not reached, the winnings from the rounds are multiplied by <span class="m-strong">3</span>.</p>
<p class="m-p">In the service, the amount is shown on the end screen if you choose <span class="m-btn">Prize amount</span> in the <span class="m-strong">End screen mode</span> option (this option is only available in a game with a final). The amount is calculated like this:</p>
<ol class="m-ol">
<li>the winning team's points from the rounds and the points scored in the final are added together;</li>
<li>the total is multiplied by the <span class="m-strong">Prize multiplier (after finale)</span> (default <span class="m-code">3</span>);</li>
<li>if the final reached its target, the <span class="m-strong">Main prize amount</span> is added (default <span class="m-code">25000</span>).</li>
</ol>
<div class="m-table-wrap"><table class="m-table"><thead><tr><th>Example (default settings)</th><th>Points from rounds</th><th>Points from the final</th><th>Prize amount</th></tr></thead><tbody>
<tr><td>Final target not reached</td><td>284</td><td>36</td><td>(284 + 36) × 3 = 960</td></tr>
<tr><td>Final target reached</td><td>310</td><td>205</td><td>(310 + 205) × 3 + 25,000 = 26,545</td></tr>
</tbody></table></div>
<p class="m-p">You can change the final target, the prize multiplier and the main prize amount, and instead of the amount you can show the logo or just the points at the end. How to do this is described in <a class="m-ref" href="#r16-6">chapter 16.6</a>; choosing final questions in <a class="m-ref" href="#r16-5-2">chapter 16.5.2</a>.</p>
`,
  account: `
<h2 class="m-ch" id="r5">5. User account</h2>
<p class="m-p">This chapter covers everything about your account: registration, logging in, the guest account, your username, changing your email address and password, recovering access, other settings and deleting your account.</p>

<h3 class="m-h2" id="r5-1">5.1 Ways to use the service</h3>
<p class="m-p">You can use the service in two ways:</p>
<ul class="m-ul">
<li><span class="m-strong">Registered account</span>: you create it with an email address and a password. Your games, question bases and logos belong to your account, so you can come back to them from any device. Only a registered account gives you access to the <span class="m-page">Friends</span>, <span class="m-page">Subscribers</span> and <span class="m-page">Tasks</span> pages and lets you share materials with other people.</li>
<li><span class="m-strong">Guest account</span>: lets you start working straight away without giving an email address. You can create games, question bases and logos and run a game, but the account only works in this browser and is deleted after a few days without activity (details in <a class="m-ref" href="#r5-4">chapter 5.4</a>).</li>
</ul>
<p class="m-p">You will find all the options on the <span class="m-page">Login</span> page:</p>
<ul class="m-ul">
<li><span class="m-btn"><i class="ico" data-icon="arrow-right"></i>Log in</span>: log in to an existing account,</li>
<li><span class="m-btn"><i class="ico" data-icon="plus"></i>Create account</span>: switch the form to registration mode,</li>
<li><span class="m-btn"><i class="ico" data-icon="person"></i>Continue as guest</span>: start working without registering,</li>
<li><span class="m-btn"><i class="ico" data-icon="envelope"></i>Forgot password</span>: send a link to set a new password,</li>
<li><span class="m-btn"><i class="ico" data-icon="arrow-left"></i>Home page</span>: go back to the service's home page.</li>
</ul>
<div class="m-note"><p class="m-p">If you visit, as a guest, a page that is only available to registered accounts, you will see the message <span class="m-page">Not available for guest account</span> with a <span class="m-btn">Sign in / Create account</span> button.</p></div>

<h3 class="m-h2" id="r5-2">5.2 Registration and email confirmation</h3>
<p class="m-p">To create an account:</p>
<ol class="m-ol">
<li>On the <span class="m-page">Login</span> page, click <span class="m-btn"><i class="ico" data-icon="plus"></i>Create account</span>. A list of password requirements appears below the fields.</li>
<li>Enter your email address and password, and type the password again in the <span class="m-code">Repeat password</span> field. The password must meet the requirements described in <a class="m-ref" href="#r5-6">chapter 5.6</a>.</li>
<li>Click <span class="m-btn"><i class="ico" data-icon="plus"></i>Register</span>.</li>
<li>Open the email sent to the address you gave and click the confirmation link. If you can't see the email, check your spam folder.</li>
<li>After confirming, you will see the message <span class="m-code">Done! Account confirmed.</span> and you will be taken to set your username (<a class="m-ref" href="#r5-5">chapter 5.5</a>), and then to the <span class="m-page">My games</span> page.</li>
</ol>
<p class="m-p">The <span class="m-btn"><i class="ico" data-icon="person"></i>I have an account</span> button switches the form back to login mode. The eye icon in the password field shows or hides what you typed.</p>
<p class="m-p">Common situations during registration:</p>
<ul class="m-ul">
<li><span class="m-strong">The address is already registered</span>: you will see the message <span class="m-code">This account already exists. Switching to login.</span> and the form switches to login mode. If you don't remember your password, see <a class="m-ref" href="#r5-7">chapter 5.7</a>.</li>
<li><span class="m-strong">Registration for this address is already in progress</span> (the link has not been clicked yet): the <span class="m-page">Registration in progress</span> window appears. Click <span class="m-btn">Resend email</span> to get the email again. You can resend once an hour; before that, you will see how long you need to wait.</li>
<li><span class="m-strong">No email arrived</span>: check your spam folder and that the address is correct, then ask for the email again by registering once more with the same address.</li>
<li><span class="m-strong">The link doesn't work</span>: the message <span class="m-code">The link is invalid or expired.</span> or <span class="m-code">This link has already been used.</span> means you need to send a new email, or simply log in if the account has already been confirmed.</li>
</ul>
<p class="m-p">If you are already using a guest account in this browser, during registration you will be asked whether to move the guest data to the new account, as described in <a class="m-ref" href="#r5-4">chapter 5.4</a>.</p>

<h3 class="m-h2" id="r5-3">5.3 Logging in and out</h3>
<p class="m-p">To log in, enter your <span class="m-strong">email address or username</span> in the first field and your password in the second, then click <span class="m-btn"><i class="ico" data-icon="arrow-right"></i>Log in</span> (or press <kbd class="m-kbd">Enter</kbd> in the password field). After logging in, you will land on the <span class="m-page">My games</span> page.</p>
<p class="m-p">The most common login messages:</p>
<ul class="m-ul">
<li><span class="m-code">Wrong email or password.</span>: check what you typed,</li>
<li><span class="m-code">I don't know this username.</span>: the username does not exist; try logging in with your email address,</li>
<li><span class="m-code">Please confirm your email first.</span>: the account has not yet been confirmed with the link from the email (<a class="m-ref" href="#r5-2">chapter 5.2</a>).</li>
</ul>
<p class="m-p">The service remembers that you are logged in on a given browser. If you return to the <span class="m-page">Login</span> page while still logged in, you will be taken straight on.</p>
<p class="m-p"><span class="m-strong">Returning to what you were doing.</span> If you open a link from an email (for example a friend invitation, a task to complete or a shared question base) while not logged in, after logging in you will go straight back to that invitation instead of the <span class="m-page">My games</span> page.</p>
<p class="m-p"><span class="m-strong">Logging out.</span> Click your username in the top bar (on a phone you will find it in the menu) and choose <span class="m-btn">Log out</span>. The same menu also has <span class="m-btn">Account settings</span>, which leads to the page described later in this chapter.</p>
<div class="m-warn"><p class="m-p">If you have an active guest account in this browser and log in to a registered account, the <span class="m-page">Active guest session</span> window appears. Clicking <span class="m-btn">Sign in and remove guest account</span> permanently deletes the guest account together with its data. If the guest data matters to you, click <span class="m-btn">Cancel</span> and save it first (<a class="m-ref" href="#r5-4">chapter 5.4</a>) or export it.</p></div>

<h3 class="m-h2" id="r5-4">5.4 Guest account and saving your data</h3>
<p class="m-p">Click <span class="m-btn"><i class="ico" data-icon="person"></i>Continue as guest</span> on the <span class="m-page">Login</span> page to go straight to the <span class="m-page">My games</span> page. A guest gets a temporary name starting with <span class="m-code">guest_</span>. The first time, you will see the <span class="m-page">Guest account</span> window with the most important information.</p>
<h4 class="m-h3" id="r5-4-1">5.4.1 Guest account limitations</h4>
<ul class="m-ul">
<li>The account works <span class="m-strong">only in this browser</span>. Clearing your browsing history (cookies) or using another device means losing access.</li>
<li>The account is <span class="m-strong">deleted after 5 days without activity</span>. Every visit to the service extends this period. Once it has been deleted, the login page shows a message saying the account was deleted due to inactivity, and you can continue as a new guest or register.</li>
<li>The <span class="m-page">Friends</span>, <span class="m-page">Subscribers</span> and <span class="m-page">Tasks</span> pages and sharing materials with other people are not available.</li>
<li>In <span class="m-page">Account settings</span>, a guest only sees the <span class="m-strong">Save your data</span> and <span class="m-strong">Delete account</span> sections.</li>
</ul>
<p class="m-p">Once a day, a reminder to save your data may appear at the top of the page with a <span class="m-btn">Migrate now</span> link. You can close it for today or turn it off with the <span class="m-btn">Don't show again</span> button.</p>
<h4 class="m-h3" id="r5-4-2">5.4.2 Turning a guest account into a registered account</h4>
<p class="m-p">Converting keeps all your games, question bases and files. You can do it in two ways.</p>
<p class="m-p"><span class="m-strong">Option 1: in account settings</span></p>
<ol class="m-ol">
<li>Click your guest name in the top bar and choose <span class="m-btn">Account settings</span> (or click <span class="m-btn">Migrate now</span> in the reminder).</li>
<li>In the <span class="m-strong">Save your data</span> section, optionally enter a username, then your email address, password and the password again.</li>
<li>Click <span class="m-btn"><i class="ico" data-icon="restore"></i>Migrate account</span>.</li>
<li>Open the email sent to the address you gave and click the confirmation link.</li>
</ol>
<p class="m-p">Until you click the link, you keep using the guest account. The section shows the <span class="m-btn"><i class="ico" data-icon="refresh"></i>Resend</span> button (you can resend once an hour) and the <span class="m-btn"><i class="ico" data-icon="close"></i>Cancel</span> button, which stops the conversion; the account then stays a guest account.</p>
<p class="m-p"><span class="m-strong">Option 2: on the login page</span></p>
<ol class="m-ol">
<li>Click your guest name in the top bar and choose <span class="m-btn">Sign in / Create account</span>.</li>
<li>Click <span class="m-btn"><i class="ico" data-icon="plus"></i>Create account</span>, enter your email address, password and the password again, then click <span class="m-btn"><i class="ico" data-icon="plus"></i>Register</span>.</li>
<li>In the <span class="m-page">Migrate guest account?</span> window, click <span class="m-btn">Yes, migrate data</span>. You will be logged out and an email with a link will be sent to the address you gave.</li>
<li>Click the link in the email. If the service asks you to, log in again, and then set your username (<a class="m-ref" href="#r5-5">chapter 5.5</a>).</li>
</ol>
<p class="m-p">If you choose <span class="m-btn">No</span> in the <span class="m-page">Migrate guest account?</span> window, a separate, new account is created and the guest data is not moved to it.</p>
<div class="m-note"><p class="m-p">If you don't give a username during the conversion, or the name you chose is taken in the meantime, after you confirm your address the service will ask you to set your own name in place of the temporary guest name.</p></div>

<h3 class="m-h2" id="r5-5">5.5 Username and profile</h3>
<p class="m-p">The first time you log in to a new account, you will see the <span class="m-page">First login</span> screen asking you to <span class="m-strong">Set your username</span>. Enter a name and click <span class="m-btn"><i class="ico" data-icon="save"></i>Save name</span>. You can't continue without a username.</p>
<p class="m-p">Username requirements:</p>
<ul class="m-ul">
<li>3 to 20 characters,</li>
<li>only letters without Polish diacritics, digits and the characters <span class="m-code">_</span> <span class="m-code">.</span> <span class="m-code">-</span> are allowed,</li>
<li>the name can't start with <span class="m-code">guest_</span>, which is reserved for guest accounts,</li>
<li>the name must be free; upper and lower case don't matter when checking, so <span class="m-code">Ania</span> and <span class="m-code">ania</span> are the same name,</li>
<li>some name beginnings are reserved for the service (e.g. <span class="m-code">admin</span>, <span class="m-code">familiada</span>, <span class="m-code">support</span>); such a name is rejected with the message <span class="m-code">This username is already taken.</span></li>
</ul>
<p class="m-p"><span class="m-strong">Where your name is shown.</span> Your name is shown in the service's top bar, and other users see it on invitations you send and on their friends and subscribers lists. You can also use it instead of your email address when logging in and when asking for a password reset.</p>
<p class="m-p"><span class="m-strong">Changing your name.</span> Open <span class="m-page">Account settings</span>, enter a new name in the <span class="m-strong">Username</span> section and click <span class="m-btn"><i class="ico" data-icon="save"></i>Save name</span>. You can change your name at most once an hour; until then, a countdown <span class="m-code">You can try again in …</span> is shown below the field.</p>

<h3 class="m-h2" id="r5-6">5.6 Changing your email address and password</h3>
<h4 class="m-h3" id="r5-6-1">5.6.1 Changing your email address</h4>
<ol class="m-ol">
<li>In <span class="m-page">Account settings</span>, in the <span class="m-strong">Email</span> section, enter the new address.</li>
<li>Click <span class="m-btn"><i class="ico" data-icon="envelope-out"></i>Change email</span>.</li>
<li>The service sends emails with links <span class="m-strong">to both your current and your new address</span>. Click the link in both emails; the order doesn't matter, and you can open each link on a different device.</li>
</ol>
<p class="m-p">Confirming from both inboxes protects your account: someone with access to only one of them can't complete the change, and you can be sure the new address is correct. After clicking the first link, you will see the message <span class="m-code">First link confirmed.</span> asking you to confirm the second one. Until the change is complete, you log in with your current address.</p>
<p class="m-p">While waiting, the section shows the new address and these buttons:</p>
<ul class="m-ul">
<li><span class="m-btn"><i class="ico" data-icon="refresh"></i>Resend</span>: send the emails again,</li>
<li><span class="m-btn"><i class="ico" data-icon="close"></i>Cancel change</span>: stop the change; links sent earlier stop working.</li>
</ul>
<p class="m-p">You can change your address and resend the emails at most once an hour. You can't start a new change until the previous one has been completed or cancelled.</p>
<div class="m-note"><p class="m-p">No longer have access to your current email address? Export your important games, question bases and logos (see <a class="m-ref" href="#r6-7">chapter 6.7</a>), delete the account (<a class="m-ref" href="#r5-9">chapter 5.9</a>), create a new one with the right address and import your data again.</p></div>
<h4 class="m-h3" id="r5-6-2">5.6.2 Changing your password</h4>
<ol class="m-ol">
<li>In the <span class="m-strong">Password</span> section, enter the new password and repeat it in the second field.</li>
<li>Click <span class="m-btn"><i class="ico" data-icon="save"></i>Change password</span>.</li>
</ol>
<p class="m-p">The password must contain:</p>
<ul class="m-ul">
<li>at least 8 characters,</li>
<li>a lowercase letter,</li>
<li>an uppercase letter,</li>
<li>a digit,</li>
<li>a special character (e.g. <span class="m-code">!</span>, <span class="m-code">#</span>, <span class="m-code">?</span>).</li>
</ul>
<p class="m-p">The new password must be different from the current one. You can change your password at most once an hour.</p>

<h3 class="m-h2" id="r5-7">5.7 Recovering access and security</h3>
<h4 class="m-h3" id="r5-7-1">5.7.1 Resetting a forgotten password</h4>
<ol class="m-ol">
<li>On the <span class="m-page">Login</span> page, enter your email address or username in the first field.</li>
<li>Click <span class="m-btn"><i class="ico" data-icon="envelope"></i>Forgot password</span>. You will see a message that the link has been sent.</li>
<li>Open the email (check your spam folder too) and click the link.</li>
<li>On the <span class="m-page">Set a new password</span> page, enter the new password twice and click <span class="m-btn"><i class="ico" data-icon="save"></i>Save password</span>. The password must meet the requirements in <a class="m-ref" href="#r5-6-2">chapter 5.6.2</a>.</li>
<li>After the message <span class="m-code">Password changed. Returning to login…</span>, log in with your new password.</li>
</ol>
<p class="m-p">A reset link can be sent to a given address <span class="m-strong">once an hour</span>. The button then shows a countdown <span class="m-code">You can resend in …</span> and stays inactive. If the link has expired or has already been used, ask for a new one once this time has passed.</p>
<p class="m-p">If you open the link from the email in a browser where you are logged in to a different account, the service asks whether to log out of the current account. Click <span class="m-btn">Sign out and continue</span> to finish the reset, or <span class="m-btn">Cancel</span>. The same applies to email confirmation links.</p>
<h4 class="m-h3" id="r5-7-2">5.7.2 Checking that you are not a robot</h4>
<p class="m-p">The service protects logging in, registering and sending emails against automated attempts. Usually this happens without you noticing. After <span class="m-strong">three failed login attempts</span> on the same account, and when the automatic check fails, the <span class="m-page">Confirm you are human</span> window appears. Complete the check shown; once you pass, the service continues automatically. If you see a verification error, refresh the page and try again.</p>

<h3 class="m-h2" id="r5-8">5.8 Other account settings</h3>
<p class="m-p">You open the <span class="m-page">Account settings</span> page from the menu under your username in the top bar. Besides the sections described above, you will find:</p>
<h4 class="m-h3" id="r5-8-1">5.8.1 Email messages</h4>
<p class="m-p">The <span class="m-btn">Enable email notifications</span> checkbox decides whether you get emails about subscription invitations, tasks to complete and shared question bases. When you turn it off, the service asks you to confirm. Once it's off, you will still see all invitations and tasks directly in the service. More about notifications in <a class="m-ref" href="#r14">chapter 14</a>.</p>
<h4 class="m-h3" id="r5-8-2">5.8.2 Your rating of the service</h4>
<p class="m-p">This section shows the rating (number of stars) and comment you gave earlier. If you haven't rated the service yet, click <span class="m-btn"><i class="ico" data-icon="star"></i>Rate</span>; if you already have a rating, click <span class="m-btn"><i class="ico" data-icon="pencil"></i>Change rating</span>. In the window, choose 1 to 5 stars, optionally add a comment and save. The rating is anonymous and only administrators see the comment.</p>
<h4 class="m-h3" id="r5-8-3">5.8.3 Demo materials</h4>
<p class="m-p">The <span class="m-btn"><i class="ico" data-icon="refresh"></i>Restore demo files</span> button uploads the sample starter materials again: ready-made games in various categories, question bases and logos. After you confirm in the <span class="m-page">Restore demo files?</span> window with the <span class="m-btn">Restore</span> button, you will be taken to the <span class="m-page">My games</span> page, where the demo materials will appear.</p>
<div class="m-warn"><p class="m-p">Demo materials already in your account will be deleted and replaced with new copies. If you made important changes to them, make a copy of them or export them before restoring.</p></div>

<h3 class="m-h2" id="r5-9">5.9 Deleting your account</h3>
<div class="m-warn"><p class="m-p">Deleting an account cannot be undone. Before deleting, export the materials you want to keep (<a class="m-ref" href="#r6-7">chapter 6.7</a>).</p></div>
<p class="m-p"><span class="m-strong">Registered account:</span></p>
<ol class="m-ol">
<li>In <span class="m-page">Account settings</span>, in the <span class="m-strong">Delete account</span> section, enter your current password.</li>
<li>Click <span class="m-btn"><i class="ico" data-icon="trash"></i>Delete account and data</span>. The password you entered is the only confirmation: once you click, the account is deleted immediately.</li>
</ol>
<p class="m-p"><span class="m-strong">Guest account:</span> click <span class="m-btn"><i class="ico" data-icon="trash"></i>Delete account and data</span>, then confirm in the <span class="m-page">Delete guest account?</span> window with the <span class="m-btn">Delete</span> button. A guest doesn't enter a password.</p>
<p class="m-p">After deletion, you will be logged out and taken to the <span class="m-page">Login</span> page.</p>
<h4 class="m-h3" id="r5-9-1">5.9.1 What gets deleted</h4>
<ul class="m-ul">
<li>your profile, username and login details,</li>
<li>all your games with their questions, polls and the votes collected in them,</li>
<li>your question bases, including those you shared with others; your collaborators lose access to them,</li>
<li>your logos and uploaded files,</li>
<li>your friends list and friend invitations,</li>
<li>subscribers, your subscriptions and tasks (sent and received),</li>
<li>question base invitations and copies of games or logos waiting for you to accept them,</li>
<li>email settings, your rating of the service and messages sent through the contact form.</li>
</ul>
<h4 class="m-h3" id="r5-9-2">5.9.2 What remains</h4>
<ul class="m-ul">
<li>Copies of games and logos you sent to other people earlier belong to the recipients and stay in their accounts.</li>
<li>Votes you cast in other users' polls stay in their results, but are no longer linked to your account.</li>
<li>Games you submitted to Community Games earlier are not deleted with your account and are no longer linked to it.</li>
</ul>
<p class="m-p">After deleting your account, you can create a new one with the same email address at any time.</p>
`,
  games: `
<h2 class="m-ch" id="r6">6. My games</h2>

<h3 class="m-h2" id="r6-1">6.1 What the "My games" page is for</h3>
<p class="m-p">The <span class="m-page">My games</span> page is the service's main page. You see it right after logging in, both with an account and as a guest (<a class="m-ref" href="#r5-4">chapter 5.4</a>). This is where you start almost everything: you create and edit games, start polls and games, and go to the other parts of the service.</p>
<p class="m-p">In the top bar you will find buttons leading to other pages:</p>
<ul class="m-ul">
<li><span class="m-btn"><i class="ico" data-icon="gamepad"></i>Community Games</span>: a catalog of games shared by other users (<a class="m-ref" href="#r13">chapter 13</a>),</li>
<li><span class="m-btn"><i class="ico" data-icon="display"></i>Logos</span>: logos shown during the game (<a class="m-ref" href="#r8">chapter 8</a>),</li>
<li><span class="m-btn"><i class="ico" data-icon="drawer"></i>Question bases</span>: your collections of questions (<a class="m-ref" href="#r9">chapter 9</a>),</li>
<li><span class="m-btn"><i class="ico" data-icon="people"></i>Friends</span>, <span class="m-btn"><i class="ico" data-icon="envelope"></i>Subscribers</span>, <span class="m-btn"><i class="ico" data-icon="bell"></i>Tasks</span> and <span class="m-btn"><i class="ico" data-icon="phone"></i>Connect device</span>: available only to people with an account (<a class="m-ref" href="#r10">chapters 10</a>, <a class="m-ref" href="#r14">14</a> and <a class="m-ref" href="#r15-4">15.4</a>).</li>
</ul>
<p class="m-p">A number on a button shows things waiting for you, such as new invitations. When the buttons don't fit on the screen, some of them move to the <span class="m-btn">More</span> menu. The <span class="m-btn"><i class="ico" data-icon="info"></i>Help</span> button opens this manual.</p>
<p class="m-p">The main part of the page is your game library. Games are split into tabs by type:</p>
<ul class="m-ul">
<li><span class="m-btn">Standard poll</span>: games where voters type in the answers,</li>
<li><span class="m-btn">Points</span>: games where voters choose from prepared answers,</li>
<li><span class="m-btn">Prepared</span>: games with answers and points entered by hand (this tab opens by default),</li>
<li><span class="m-btn">Community Games</span>: games added from the community catalog.</li>
</ul>
<p class="m-p">On a phone, the tabs have shorter names: <span class="m-code">Poll</span>, <span class="m-code">Points</span>, <span class="m-code">Prep.</span> and <span class="m-code">Community</span>. The differences between game types are described in <a class="m-ref" href="#r7-1">chapter 7.1</a>.</p>
<p class="m-p">The library contains your own games and copies of games you accepted from friends. Copies waiting for your decision appear above the tiles of the matching tab in the <span class="m-page">Received copies</span> section, with <span class="m-btn"><i class="ico" data-icon="check"></i>Accept</span> and <span class="m-btn"><i class="ico" data-icon="close"></i>Decline</span> buttons (<a class="m-ref" href="#r11-4">chapter 11.4</a>).</p>
<p class="m-p">In the <span class="m-btn">Community Games</span> tab you see games added from the catalog. You can preview them, change their settings and run them, but you can't edit, duplicate, export or send them. The bin on the tile removes the game from your library (after you confirm). Details are in <a class="m-ref" href="#r13-4">chapter 13.4</a>.</p>

<h3 class="m-h2" id="r6-2">6.2 The game list and game statuses</h3>
<p class="m-p">Each game has its own tile on the list. On the tile you see the game's name, a label showing its state and sometimes extra information.</p>
<div class="m-table-wrap"><table class="m-table"><thead><tr><th>Label</th><th>Meaning</th></tr></thead><tbody>
<tr><td><span class="m-code">DRAFT</span></td><td>A game in preparation. In a poll game: the poll has not been started yet. In a prepared game: the game does not yet meet the conditions needed to play.</td></tr>
<tr><td><span class="m-code">OPEN</span></td><td>The poll is running and collecting votes. Next to it you see the number of votes cast, e.g. <span class="m-code">12 votes</span>.</td></tr>
<tr><td><span class="m-code">STOPPED</span></td><td>Voting has been paused, but the votes have not been counted yet. Next to it you see the label <span class="m-code">to be counted</span>.</td></tr>
<tr><td><span class="m-code">READY</span></td><td>The game can be played. In a poll game, this means the poll has been counted and closed. In a prepared game, it means the game meets all the conditions in <a class="m-ref" href="#r7-6">chapter 7.6</a>.</td></tr>
</tbody></table></div>
<p class="m-p">If the game is a copy received from a friend, the tile also shows who it came from, e.g. <span class="m-code">From: Ania</span>.</p>
<p class="m-p">When a game is missing something needed for the next step, its tile is highlighted and the reason appears below the name. For a prepared game, this is about starting to play; for a poll in draft, it's about starting the poll. The message shows the first problem found, e.g.:</p>
<ul class="m-ul">
<li><span class="m-code">The game needs at least 10 questions (you have 6).</span>: add the missing questions,</li>
<li><span class="m-code">Question #3: needs 3–6 answers (it has 2).</span>: add answers to that question,</li>
<li><span class="m-code">Question #5: every answer needs at least 4 pts.</span>: fix the points,</li>
<li><span class="m-code">Question #7: points cannot add up to more than 100 (currently 112).</span>: reduce the points in that question.</li>
</ul>
<p class="m-p">You can fix these in the editor (<a class="m-ref" href="#r7-2">chapter 7.2</a>). The editor shows the full list of conditions live above the question list.</p>
<p class="m-p">In the left part of the card's bottom bar, you can narrow the list: search for a game by name (the <span class="m-code">Search…</span> field, or the magnifier button on a phone), change the order of tiles (<span class="m-code">Recently modified</span>, <span class="m-code">Newest</span>, <span class="m-code">Name A–Z</span>) and show only games in a chosen state or copies marked as <span class="m-code">Received</span>. The list refreshes itself automatically every several seconds, so, for example, the vote count of an open poll goes up without reloading the page.</p>

<h3 class="m-h2" id="r6-3">6.3 Creating and selecting a game</h3>
<p class="m-p">You create a new game in the tab of the type you want the game to be:</p>
<ol class="m-ol">
<li>Choose the <span class="m-btn">Standard poll</span>, <span class="m-btn">Points</span> or <span class="m-btn">Prepared</span> tab.</li>
<li>Click the first tile on the list, <span class="m-btn"><i class="ico" data-icon="plus"></i>New game</span>.</li>
<li>In the <span class="m-page">New game</span> window, enter a name (up to 80 characters) and click <span class="m-btn">Save</span>.</li>
</ol>
<p class="m-p">The new game appears on the list as a <span class="m-code">DRAFT</span> and is selected straight away. To add questions, click <span class="m-btn"><i class="ico" data-icon="edit-paper"></i>Edit</span>. If you chose the wrong game type, you can change it later (<a class="m-ref" href="#r7-8">chapter 7.8</a>).</p>
<p class="m-p">To do anything with an existing game, first select it: click (tap) its tile. The selected tile is highlighted and the action buttons become active. Clicking an empty area of the card clears the selection.</p>

<h3 class="m-h2" id="r6-4">6.4 Actions on the selected game</h3>
<p class="m-p">Above the game list there is a bar with the main actions. They apply to the selected game:</p>
<ul class="m-ul">
<li><span class="m-btn"><i class="ico" data-icon="gamepad"></i>Play</span>: opens the game control panel (<a class="m-ref" href="#r17">chapter 17</a>). A prepared game must meet the readiness conditions, and a poll game must have a closed poll.</li>
<li><span class="m-btn"><i class="ico" data-icon="settings"></i>Game settings</span>: teams, appearance, sound and the choice of questions for the game (<a class="m-ref" href="#r16">chapter 16</a>).</li>
<li><span class="m-btn"><i class="ico" data-icon="edit-paper"></i>Edit</span>: opens the question and answer editor (<a class="m-ref" href="#r7">chapter 7</a>).</li>
<li><span class="m-btn"><i class="ico" data-icon="eye"></i>Preview</span>: shows the game's questions and answers (with points, if it has them) without opening the editor. In poll games, the <span class="m-btn"><i class="ico" data-icon="gamepad"></i>Game</span> / <span class="m-btn"><i class="ico" data-icon="polls"></i>Poll</span> switch also lets you see the current poll results.</li>
<li><span class="m-btn"><i class="ico" data-icon="polls"></i>Poll</span>: goes to the game's poll (<a class="m-ref" href="#r15">chapter 15</a>). The button only works in poll games. You can open a poll in draft when the game meets the conditions for starting it (<a class="m-ref" href="#r7-6">chapter 7.6</a>). You can always enter an open, stopped or closed poll.</li>
</ul>
<p class="m-p">The <span class="m-btn"><i class="ico" data-icon="gamepad"></i>Play</span> and <span class="m-btn"><i class="ico" data-icon="settings"></i>Game settings</span> buttons are only visible on wider screens (tablet, computer). Running a game and its settings need a larger screen.</p>
<p class="m-p">The card's bottom bar has further actions:</p>
<ul class="m-ul">
<li><span class="m-btn"><i class="ico" data-icon="duplicate"></i>Duplicate</span> and <span class="m-btn"><i class="ico" data-icon="envelope-out"></i>Send</span>: a copy of the game for yourself or for a friend (<a class="m-ref" href="#r6-6">chapter 6.6</a>),</li>
<li><span class="m-btn"><i class="ico" data-icon="change-type"></i>Change type</span>: changes the type of the same game. It doesn't create a copy, it converts the existing game (<a class="m-ref" href="#r7-8">chapter 7.8</a>),</li>
<li><span class="m-btn"><i class="ico" data-icon="download"></i>Export to file</span>, <span class="m-btn"><i class="ico" data-icon="drawer-export"></i>Export to base</span> and <span class="m-btn"><i class="ico" data-icon="upload"></i>Import</span>: moving games (<a class="m-ref" href="#r6-7">chapter 6.7</a>).</li>
</ul>
<p class="m-p">On a phone, the bottom bar buttons show icons only.</p>
<p class="m-p">Which actions are available depends on the game's type and state. When a button is inactive, hover over it to see why, e.g. <span class="m-code">The poll is open — editing is locked.</span> The main rules:</p>
<div class="m-table-wrap"><table class="m-table"><thead><tr><th>Game state</th><th>What you can do</th></tr></thead><tbody>
<tr><td>Prepared game</td><td>Edit, change type, duplicate, send and export at any time. Play when the game meets the readiness conditions. No poll.</td></tr>
<tr><td>Poll in draft</td><td>Edit, change type, duplicate, send, export, start the poll (when the content meets the conditions). Play only after the poll is closed.</td></tr>
<tr><td>Poll open or stopped</td><td>No editing, changing type or sending. Duplicate and export after confirming, without the collected votes.</td></tr>
<tr><td>Poll closed (game ready)</td><td>Play, duplicate and export with the result. Edit and change type after confirming a poll reset (<a class="m-ref" href="#r7-5">chapter 7.5</a>). No sending.</td></tr>
<tr><td>Game being run in the control panel</td><td>Editing and changing type are locked until the game ends (or after an hour without activity).</td></tr>
</tbody></table></div>

<h3 class="m-h2" id="r6-5">6.5 Renaming and deleting a game</h3>
<p class="m-p">To rename a game, double-click its tile (on a touch screen, tap it twice). In the <span class="m-page">Rename</span> window, enter a new name (up to 80 characters, it can't be empty) and click <span class="m-btn">Save</span>. You can also rename the game in the game editor (<a class="m-ref" href="#r7-2">chapter 7.2</a>).</p>
<p class="m-p">To delete a game, click the bin icon <span class="m-btn"><i class="ico" data-icon="trash"></i>Delete</span> on its tile, then confirm in the <span class="m-page">Delete game</span> window with the <span class="m-btn">Delete</span> button.</p>
<div class="m-warn"><p class="m-p">Deleting a game cannot be undone. The game's questions, answers and settings are deleted with it. If the game has an open or stopped poll, the confirmation window warns: <span class="m-code">The poll will be aborted.</span> After deletion, voting stops working and the collected votes are lost.</p></div>
<p class="m-p">A game that is open somewhere else (in the editor, game settings, poll or control panel, in another browser tab or on another device) is temporarily locked. You then can't rename it (message <span class="m-code">This game is open elsewhere.</span>) or delete it (message <span class="m-code">Can't delete the game — it's currently open in another tab (editor, settings, or poll).</span>). Close the game there and try again.</p>

<h3 class="m-h2" id="r6-6">6.6 Duplicating games and sending copies</h3>
<p class="m-p">The service lets you copy a game in two ways:</p>
<ul class="m-ul">
<li><span class="m-btn"><i class="ico" data-icon="duplicate"></i>Duplicate</span> creates a copy in your own library. The copy gets a name ending in <span class="m-code">copy</span> (then <span class="m-code">copy 2</span>, <span class="m-code">copy 3</span>…), and the service selects it straight away and switches to its tab.</li>
<li><span class="m-btn"><i class="ico" data-icon="envelope-out"></i>Send</span> passes a copy to the friends you choose. It appears for them as an offer to accept or decline. Details are in <a class="m-ref" href="#r11-2">chapter 11.2</a>.</li>
</ul>
<p class="m-p">Each copy is an independent game. Changes to the copy don't affect the original, and changes to the original don't affect the copy.</p>
<p class="m-p">What goes into the copy:</p>
<ul class="m-ul">
<li>Draft and prepared game: questions, answers and points, as in the original.</li>
<li>Poll open or stopped: the service first shows the <span class="m-page">Without current votes</span> warning. After you click <span class="m-btn">Continue</span>, the copy is created as a draft of the same type, without the collected votes.</li>
<li>Poll closed: the copy keeps the result, that is the answers and points from counting. It does not contain the votes themselves, though.</li>
</ul>
<p class="m-p">You can send a friend a prepared game or a poll in draft. You can't send an open, stopped or closed poll (message <span class="m-code">Only a game draft (without poll results) can be sent.</span>). If you want to pass someone a closed poll with its result, use export to file (<a class="m-ref" href="#r6-7">chapter 6.7</a>).</p>
<p class="m-p">Duplicating and sending are only available to people with an account; a guest doesn't see these buttons. Games in the <span class="m-btn">Community Games</span> tab can't be duplicated or sent. Duplicating and sending are different from adding a game from the Community Games catalog: a game from the catalog goes to a separate tab and can't be edited (<a class="m-ref" href="#r13-4">chapter 13.4</a>).</p>
<div class="m-note"><p class="m-p">Being able to duplicate, send or export a game doesn't mean the game is ready to play. A copy may need completing; its tile will show what's missing.</p></div>

<h3 class="m-h2" id="r6-7">6.7 Importing and exporting</h3>
<p class="m-p">You can save games to a file and load them from a file, for example to move them to another account or keep a backup. You can also move a game's questions to a question base.</p>

<h4 class="m-h3" id="r6-7-1">6.7.1 Exporting a game to a file</h4>
<ol class="m-ol">
<li>Select the game and click <span class="m-btn"><i class="ico" data-icon="download"></i>Export to file</span>.</li>
<li>If the game has an open or stopped poll, confirm the <span class="m-page">Without current votes</span> warning with the <span class="m-btn">Continue</span> button.</li>
<li>Wait until the progress window shows that it has finished. The file is saved to your downloads, and you close the window with the <span class="m-btn">Done</span> button.</li>
</ol>
<p class="m-p">The file has the <span class="m-code">.famgame</span> extension and a name based on the game's name. What the file contains depends on the game's state:</p>
<ul class="m-ul">
<li>prepared game: questions, answers and points,</li>
<li>poll in draft: in a standard poll, only the questions; in a points poll, questions and answers without points,</li>
<li>poll open or stopped: like a draft of the same type, without the collected votes,</li>
<li>poll closed: questions with the poll result (answers and points), without the votes themselves.</li>
</ul>
<p class="m-p">The file doesn't include game settings (teams, appearance, sounds, logo). Games in the <span class="m-btn">Community Games</span> tab can't be exported. If the game is currently open somewhere else, the export won't start (<span class="m-code">This game is open elsewhere.</span>).</p>

<h4 class="m-h3" id="r6-7-2">6.7.2 Importing a game from a file</h4>
<ol class="m-ol">
<li>Click <span class="m-btn"><i class="ico" data-icon="upload"></i>Import</span> in the bottom bar. You don't need to select a game.</li>
<li>In the <span class="m-page">Import</span> window, click <span class="m-btn"><i class="ico" data-icon="file-doc"></i>Choose file</span> and select a <span class="m-code">.famgame</span> or <span class="m-code">.json</span> file.</li>
<li>Check the preview: the game's name, its type, the number of questions and the list of questions with answers (and points, if the file contains them).</li>
<li>Click <span class="m-btn"><i class="ico" data-icon="upload"></i>Import</span>. When it's finished, the button changes to <span class="m-btn"><i class="ico" data-icon="check"></i>Done</span>; click it to close the window.</li>
</ol>
<p class="m-p">Importing always creates a new game and never changes an existing one. The service switches to the tab of the new game's type and selects it. A draft game in the file goes into the library as a draft. A closed poll keeps its result and is ready to play straight away.</p>
<p class="m-p">While loading, the service adjusts the content to the game rules:</p>
<ul class="m-ul">
<li>the name is shortened to 80 characters, a question to 100 characters and an answer to 17 characters,</li>
<li>empty answers are skipped and invalid points are changed to 0,</li>
<li>if a question has more than 6 answers, the 6 highest-scoring ones are kept,</li>
<li>if the closed poll result in the file is incomplete (e.g. fewer than 10 questions or too few points), the preview warns: <span class="m-code">The poll result in the file is incomplete — the game will be imported as a poll draft.</span>,</li>
<li>if the file doesn't specify a recognizable game type, the preview warns that the game will be recovered as a prepared game (draft).</li>
</ul>
<p class="m-p">An imported game may need completing, for example when the file has fewer than 10 questions. Its tile will show what's missing (<a class="m-ref" href="#r6-2">chapter 6.2</a>).</p>
<p class="m-p">When a file can't be loaded, a message appears instead of the preview and the import button stays inactive:</p>
<ul class="m-ul">
<li><span class="m-code">Invalid JSON.</span>: the file is damaged or is not a game file,</li>
<li><span class="m-code">The file does not contain a valid game (question without text or wrong format).</span>,</li>
<li><span class="m-code">This game file version is not supported.</span>,</li>
<li><span class="m-code">Unknown game type in the file.</span></li>
</ul>
<div class="m-note"><p class="m-p">If Familiada is installed as an app, you can also open a <span class="m-code">.famgame</span> file directly from your system (e.g. from a file manager). The import window opens on its own with the chosen file.</p></div>

<h4 class="m-h3" id="r6-7-3">6.7.3 Exporting questions to a question base</h4>
<p class="m-p">You can save a game's questions and answers in a question base to use them in other games.</p>
<ol class="m-ol">
<li>Select the game and click <span class="m-btn"><i class="ico" data-icon="drawer-export"></i>Export to base</span>.</li>
<li>In the <span class="m-page">Export to base</span> window, choose a base from the list. It shows your own bases and bases shared with you with edit rights.</li>
<li>Click <span class="m-btn"><i class="ico" data-icon="download"></i>Export</span> and wait for the message <span class="m-code">Export saved.</span></li>
</ol>
<p class="m-p">A new folder named after the game is created in the main folder of the chosen base. If a folder with that name already exists, the new one gets a suffix, e.g. <span class="m-code">(2)</span>. The folder receives the questions with answers, to the extent the game has them in its current state (the same as when exporting to a file). If you have no base you can save to, the window shows the message <span class="m-code">No bases found.</span> If the export fails, the service removes the partly created folder. Working with a base is described in <a class="m-ref" href="#r9">chapter 9</a>.</p>

<h2 class="m-ch" id="r7">7. Creating and editing a game</h2>

<h3 class="m-h2" id="r7-1">7.1 Choosing the game type</h3>
<p class="m-p">You create a game in one of three types. The type decides what you enter yourself and what comes from a poll.</p>
<div class="m-table-wrap"><table class="m-table"><thead><tr><th>Type</th><th>What you prepare</th><th>Where answers and points come from</th></tr></thead><tbody>
<tr><td><span class="m-btn">Standard poll</span></td><td>Only the questions.</td><td>Voters type in their own answers. After the poll ends, you count them and the service calculates the points.</td></tr>
<tr><td><span class="m-btn">Points</span></td><td>Questions and a list of answers to choose from.</td><td>Voters choose an answer from the list, and the points come from the poll results.</td></tr>
<tr><td><span class="m-btn">Prepared</span></td><td>Questions, answers and points.</td><td>You enter everything by hand. The game has no poll: when it meets the conditions, you can play straight away.</td></tr>
</tbody></table></div>
<p class="m-p">Poll games become ready to play only after the votes have been collected and counted. This is described in <a class="m-ref" href="#r15">chapter 15</a>. You can change the type of an existing game (<a class="m-ref" href="#r7-8">chapter 7.8</a>).</p>

<h3 class="m-h2" id="r7-2">7.2 The game editor</h3>
<p class="m-p">You open the editor with the <span class="m-btn"><i class="ico" data-icon="edit-paper"></i>Edit</span> button on the <span class="m-page">My games</span> page. The top bar shows the title <span class="m-page">Game editor</span> and the game type, and the <span class="m-btn"><i class="ico" data-icon="arrow-left"></i>My games</span> button on the left takes you back to the game list.</p>
<p class="m-p">The editor has three parts:</p>
<ul class="m-ul">
<li><span class="m-strong">Name</span>: the field above the editor. The change is saved when you leave the field or press <kbd class="m-kbd">Enter</kbd>. The name can have up to 80 characters. If you leave the field empty, the game gets the name <span class="m-code">New game</span>.</li>
<li><span class="m-strong">Questions</span>: the list on the left. Above it you see the game's readiness conditions (<a class="m-ref" href="#r7-6">chapter 7.6</a>). Each tile shows the number and the beginning of the question, and in games with answers also how many there are (e.g. <span class="m-code">4/6 answers</span>). In a prepared game, the tile also shows the sum of points (e.g. <span class="m-code">4/6 answers • sum 92/100</span>). In games with answers, the tile is green when the question meets the conditions and red when something is missing.</li>
<li><span class="m-strong">Question editing</span>: the part on the right with the <span class="m-page">Question text</span> field and the list of answers, if the game type has them.</li>
</ul>
<p class="m-p">Working with questions:</p>
<ul class="m-ul">
<li>To add a question, click the first tile on the list, <span class="m-btn"><i class="ico" data-icon="plus"></i>Add question</span>. Below its name you see how many questions are missing to reach the required minimum (e.g. <span class="m-code">Required minimum: 10 (you have 7)</span>). The new question gets the text <span class="m-code">Question 8</span>, which is already selected, so you can just start typing.</li>
<li>To go to another question, click its tile.</li>
<li>To delete a question, click the bin on its tile and confirm. This deletes all the answers to that question, and the remaining questions are renumbered.</li>
</ul>
<p class="m-p">At the bottom of the question list there is an <span class="m-btn"><i class="ico" data-icon="upload"></i>Import</span> button for loading questions from a text file (<a class="m-ref" href="#r7-7">chapter 7.7</a>).</p>
<p class="m-p">On a phone or tablet, when you choose a question, its editing opens in a separate window. The <span class="m-btn"><i class="ico" data-icon="arrow-left"></i>Back</span> button closes it and returns to the question list.</p>
<p class="m-p">The editor has no save button: all changes are saved automatically (<a class="m-ref" href="#r7-5">chapter 7.5</a>).</p>

<h3 class="m-h2" id="r7-3">7.3 Questions and answers</h3>
<p class="m-p">You type the question in the <span class="m-page">Question text</span> field. A question can have at most <span class="m-strong">100 characters</span>; the field won't accept longer text, including when pasting. An empty question can't be saved: if you delete all the text, the question goes back to a placeholder name, e.g. <span class="m-code">Question 3</span>.</p>
<p class="m-p">In a standard poll, you only edit the questions. The tiles show <span class="m-code">Questions only</span>, and below the question you see the note <span class="m-code">The audience types the answers in the poll.</span></p>
<p class="m-p">In a points poll and a prepared game, there is a list of answers below the question:</p>
<ul class="m-ul">
<li>To add an answer, click <span class="m-btn"><i class="ico" data-icon="plus"></i>Add answer</span>. The counter on the button shows how many answers there already are (e.g. <span class="m-code">4/6</span>). A question can have at most 6 answers; once the limit is reached, the button changes to <span class="m-code">Answer limit reached</span>.</li>
<li>A new answer gets placeholder text, e.g. <span class="m-code">ANS 4</span>, selected so you can type over it. If you delete all the text of an answer, the placeholder comes back.</li>
<li>To delete an answer, click the bin in its row and confirm.</li>
</ul>
<p class="m-p">An answer can have at most <span class="m-strong">17 characters</span>. It can only use characters the scoreboard can show. If you type a character outside this set, the field is marked, the answer isn't saved, and a message shows the characters that aren't allowed. Remove them to save the answer.</p>
<div class="m-note"><p class="m-p">In the final, the board fits only 11 characters of an answer. Longer answers will be shortened on it, so keep this in mind when preparing questions for the final.</p></div>
<p class="m-p">You can also move ready-made questions into a game from a question base, as described in <a class="m-ref" href="#r9-8">chapter 9.8</a>.</p>

<h3 class="m-h2" id="r7-4">7.4 Answer points</h3>
<p class="m-p">In a <span class="m-btn">Points</span> game you don't enter points. The poll calculates them from the votes, and the editor reminds you of this with the note <span class="m-code">You do not enter points — the poll calculates them from the audience votes.</span></p>
<p class="m-p">In a prepared game, each answer has a points field next to it. You enter how many points the answer is worth yourself:</p>
<ul class="m-ul">
<li>the field only accepts whole numbers from 0 to 100,</li>
<li>each answer must have <span class="m-strong">at least 4 points</span>; a field with a lower value is highlighted,</li>
<li>the points of the answers in one question can add up to <span class="m-strong">at most 100</span>. It doesn't have to be exactly 100. You see the current sum above the answer list (e.g. <span class="m-code">92/100</span>), and when it goes over the limit, it is highlighted.</li>
</ul>
<p class="m-p">The order in which you enter answers doesn't matter: in the preview and in the game, answers are ordered from the highest-scoring. How points are awarded during the game is described in <a class="m-ref" href="#r3">chapter 3</a>.</p>

<h3 class="m-h2" id="r7-5">7.5 Saving, and editing a game after the poll has started</h3>
<p class="m-p">The editor saves changes automatically:</p>
<ul class="m-ul">
<li>question and answer text: after a short pause in typing and when you leave the field,</li>
<li>points: when you leave the points field,</li>
<li>game name: when you leave the name field.</li>
</ul>
<p class="m-p">When you leave the editor with the <span class="m-btn"><i class="ico" data-icon="arrow-left"></i>My games</span> button, the service first finishes saving the latest changes. If saving fails, an error message appears at the bottom of the screen.</p>
<p class="m-p">Editing is only possible in some game states:</p>
<ul class="m-ul">
<li><span class="m-strong">Poll open or stopped</span>: editing is locked. The <span class="m-btn"><i class="ico" data-icon="edit-paper"></i>Edit</span> button is inactive, and if you open the editor some other way, you will see the message <span class="m-page">Not available in this game state</span> with the reason, e.g. <span class="m-code">The poll is open — editing is locked.</span> To edit the game, first finish or abort the poll (<a class="m-ref" href="#r15-5">chapter 15.5</a>).</li>
<li><span class="m-strong">Poll closed</span>: editing requires resetting the poll. The service shows the <span class="m-page">Reset poll?</span> window. After you click <span class="m-btn">Reset</span>, it deletes the poll results: votes, respondents' answers, links and QR codes. Questions and answers stay, points are reset to zero and the game goes back to draft.</li>
<li><span class="m-strong">Game being run in the control panel</span>: changes are locked until the game ends or after an hour without activity (<span class="m-code">The game is currently being run in the Control panel…</span>).</li>
</ul>
<div class="m-warn"><p class="m-p">Resetting a closed poll cannot be undone. To keep the poll result, make a copy of the game with the <span class="m-btn"><i class="ico" data-icon="duplicate"></i>Duplicate</span> button or export it to a file before editing (<a class="m-ref" href="#r6-6">chapters 6.6</a> and <a class="m-ref" href="#r6-7">6.7</a>).</p></div>
<p class="m-p">A game can only be edited in one place at a time. If the game is already open in the editor, settings, poll or control panel (in another tab or on another device), instead of the content the editor shows the message <span class="m-page">In use elsewhere</span>: <span class="m-code">This game is open elsewhere.</span> with a <span class="m-btn">Back</span> button. If someone opens this game's poll elsewhere while you are editing, the editor locks with the message <span class="m-page">Editing locked</span>.</p>

<h3 class="m-h2" id="r7-6">7.6 Game readiness conditions</h3>
<p class="m-p">Above the question list, the editor shows a live list of conditions. For poll types the list is headed <span class="m-code">You can start the poll when:</span>, and for a prepared game <span class="m-code">The game is ready when:</span>. A condition that is met has a tick, and one that isn't has a warning and the numbers of the questions it applies to (e.g. <span class="m-code">questions: 2, 5</span>).</p>
<div class="m-table-wrap"><table class="m-table"><thead><tr><th>Condition</th><th>Standard poll</th><th>Points</th><th>Prepared</th></tr></thead><tbody>
<tr><td>At least 10 questions (no upper limit)</td><td>yes</td><td>yes</td><td>yes</td></tr>
<tr><td>3 to 6 answers in each question</td><td>—</td><td>yes</td><td>yes</td></tr>
<tr><td>Each answer at least 4 pts</td><td>—</td><td>—</td><td>yes</td></tr>
<tr><td>Sum of points in a question at most 100</td><td>—</td><td>—</td><td>yes</td></tr>
</tbody></table></div>
<p class="m-p">In a standard poll you collect the answers later, during voting, so you don't enter them when creating the game. In a points poll, meeting the conditions lets you start the poll, and to play you also need its result. The conditions for closing and counting a poll are described in <a class="m-ref" href="#r15-6">chapter 15.6</a>.</p>
<p class="m-p">A game that doesn't meet the conditions can exist as a draft: you can save it, duplicate it or export it and complete it later. Such a draft is created, for example, when making a game from an incomplete set of questions in a question base (<a class="m-ref" href="#r9-8">chapter 9.8</a>). On the <span class="m-page">My games</span> page, the tile of a game that isn't ready shows the first problem (<a class="m-ref" href="#r6-2">chapter 6.2</a>).</p>

<h3 class="m-h2" id="r7-7">7.7 Importing questions from a text file</h3>
<p class="m-p">Instead of typing questions one by one, you can load them from a text file or paste the whole list at once.</p>
<ol class="m-ol">
<li>In the editor, click <span class="m-btn"><i class="ico" data-icon="upload"></i>Import</span> below the question list.</li>
<li>In the <span class="m-page">Import questions</span> window, paste the text into the field or click <span class="m-btn"><i class="ico" data-icon="file-doc"></i>Choose file</span> and select a <span class="m-code">.txt</span> file. The file's content appears in the field, where you can still correct it.</li>
<li>Check the <span class="m-page">Live preview</span>: the number of questions and answers and the first questions. If the text contains an error, the preview describes it.</li>
<li>Click <span class="m-btn"><i class="ico" data-icon="upload"></i>Import</span> and confirm replacing the game's content.</li>
</ol>
<p class="m-p">Format rules:</p>
<ul class="m-ul">
<li>An optional first line <span class="m-code">@Game name</span> sets the game's name. It only works before the first question.</li>
<li>A question is a line starting with <span class="m-code">#</span>.</li>
<li>The lines below a question are its answers. They can start with a number (<span class="m-code">1</span>, <span class="m-code">1.</span>, <span class="m-code">2)</span>, <span class="m-code">3 -</span>); the number is skipped.</li>
<li>You add points at the end of an answer after a slash, e.g. <span class="m-code">Elephant /29</span>. They are optional.</li>
<li>Empty lines, spaces and tabs don't matter.</li>
</ul>
<p class="m-p">Example:</p>
<p class="m-p"><span class="m-code">@My game</span><br><span class="m-code">#Animals in Africa</span><br><span class="m-code">1 Elephant /29</span><br><span class="m-code">2 Lion /19</span><br><span class="m-code">3 Monkey /16</span></p>
<p class="m-p">How the import treats the content:</p>
<ul class="m-ul">
<li>Points are only used in a prepared game (numbers outside 0–100 are adjusted to this range). In a points poll, points are skipped, and in a standard poll whole answers are skipped.</li>
<li>A question longer than 100 characters and an answer longer than 17 characters are shortened.</li>
<li>At most the first 6 answers of each question are loaded.</li>
<li>If an answer contains characters the scoreboard can't show, the import won't start, and a message shows the question and answer to fix.</li>
<li>An answer before the first question is an error (the message gives the line number). Text without any line starting with <span class="m-code">#</span> won't be imported either.</li>
</ul>
<div class="m-note"><p class="m-p">A number at the start of an answer is treated as a numbering and skipped. If the answer itself starts with a number (e.g. <span class="m-code">100 years</span>), put a number in front of it: <span class="m-code">1 100 years</span>.</p></div>
<div class="m-warn"><p class="m-p">Importing replaces all the current content of the game: it deletes all existing questions and answers and loads the new ones. If the import fails, the game stays unchanged. Importing isn't possible when editing the game is locked (<a class="m-ref" href="#r7-5">chapter 7.5</a>).</p></div>

<h3 class="m-h2" id="r7-8">7.8 Changing the type of an existing game</h3>
<p class="m-p">The <span class="m-btn"><i class="ico" data-icon="change-type"></i>Change type</span> button on the <span class="m-page">My games</span> page (next to the <span class="m-btn"><i class="ico" data-icon="duplicate"></i>Duplicate</span> button) changes the type of the selected game. The same game is changed; the service doesn't create a copy. After the change, the game is a draft of the new type and moves to its tab.</p>
<ol class="m-ol">
<li>Select the game and click <span class="m-btn"><i class="ico" data-icon="change-type"></i>Change type</span>.</li>
<li>If the game has a closed poll, confirm the reset in the <span class="m-page">Reset poll?</span> window (<a class="m-ref" href="#r7-5">chapter 7.5</a>).</li>
<li>In the <span class="m-page">Change game type</span> window, choose the new type. The current type is inactive, and each of the others shows what the change will do.</li>
<li>Click <span class="m-btn">Change</span>.</li>
</ol>
<div class="m-table-wrap"><table class="m-table"><thead><tr><th>Change</th><th>What happens to the content</th></tr></thead><tbody>
<tr><td>Prepared → Points</td><td>Questions and answers stay, points are removed. New points will come from the poll.</td></tr>
<tr><td>Prepared or Points → Standard poll</td><td>Questions stay, answers and points are removed.</td></tr>
<tr><td>Standard poll → Points</td><td>Questions stay. You need to add the answers to choose from in the editor.</td></tr>
<tr><td>Standard poll or Points → Prepared</td><td>Questions and answers stay. Points are not assigned automatically: answers without points have 0 pts and you need to fill them in in the editor.</td></tr>
</tbody></table></div>
<p class="m-p">With a closed poll, the reset deletes the results and sets points to zero before the type changes. That is why, when switching to a prepared game, the window adds: <span class="m-code">Points are removed.</span></p>
<p class="m-p">After the change, check the readiness conditions in the editor (<a class="m-ref" href="#r7-6">chapter 7.6</a>). Problems such as missing answers or points will be shown next to the specific questions.</p>
<p class="m-p">When changing the type isn't possible:</p>
<ul class="m-ul">
<li>when the poll is open, or stopped and waiting to be counted,</li>
<li>when the game is being run in the control panel or is open somewhere else,</li>
<li>for games in the <span class="m-btn">Community Games</span> tab.</li>
</ul>
<div class="m-warn"><p class="m-p">Answers and points deleted when changing the type can't be restored, even if you switch back to the previous type. To keep both versions, duplicate the game first (<a class="m-ref" href="#r6-6">chapter 6.6</a>) and change the type of the copy.</p></div>
`,
  logo: `
<h2 class="m-ch" id="r8">8. Game logo: creating and using it</h2>

<h3 class="m-h2" id="r8-1">8.1 What a game logo is</h3>
<p class="m-p">A game logo is a picture you prepare yourself that appears during the game, for example at the start of the game and at the end. Don't confuse it with the Familiada service logo shown on the pages: the game logo is part of your game and you can change it however you like.</p>
<p class="m-p">The players' display is a board made of dots, so every logo is shown on it as a picture of lit and unlit dots. If you don't choose your own logo, the game uses the default logo: the word FAMILIADA.</p>
<p class="m-p">You will find your logos on the <span class="m-page">My logos</span> page. You get there from the <span class="m-page">My games</span> page with the <span class="m-btn"><i class="ico" data-icon="display"></i>Logos</span> button in the top bar. The page has three tabs, matching the three ways of creating a logo:</p>
<ul class="m-ul">
  <li><span class="m-btn">Text</span>: text in the font of the classic Familiada logo (<a class="m-ref" href="#r8-2">chapter 8.2</a>),</li>
  <li><span class="m-btn">Drawing</span>: your own drawing with shapes and text (<a class="m-ref" href="#r8-3">chapter 8.3</a>),</li>
  <li><span class="m-btn">Image</span>: your image turned into display dots (<a class="m-ref" href="#r8-4">chapter 8.4</a>).</li>
</ul>
<p class="m-p">Click a logo tile to select it. For the selected logo you can use the <span class="m-btn"><i class="ico" data-icon="edit-paper"></i>Edit</span> and <span class="m-btn"><i class="ico" data-icon="eye"></i>Preview</span> buttons. The preview shows the logo as it will look on the display.</p>
<p class="m-p">To rename a logo, double-click its tile (on a touch screen, press and hold it). To delete a logo, click the <span class="m-btn"><i class="ico" data-icon="trash"></i></span> icon on the tile and confirm. If the deleted logo was selected in the settings of a game, that game will use the default logo.</p>
<div class="m-note"><p class="m-p">Creating and editing logos requires a tablet or a computer. On a phone, the logo list lets you view previews, rename, delete, import and export logos, but it doesn't show the new logo tile or the <span class="m-btn"><i class="ico" data-icon="edit-paper"></i>Edit</span> button.</p></div>

<h3 class="m-h2" id="r8-2">8.2 Creating a text logo</h3>
<p class="m-p">A text logo is text made of letters in the style of the classic Familiada logo. To create one:</p>
<ol class="m-ol">
  <li>On the <span class="m-page">My logos</span> page, choose the <span class="m-btn">Text</span> tab.</li>
  <li>Click the <span class="m-strong">New text logo</span> tile.</li>
  <li>Enter a name for the logo and click <span class="m-btn">Save</span>. The logo editor opens.</li>
  <li>Type the text in the text field, for example <span class="m-code">FAMILIADA</span>. The preview below immediately shows how the text will look on the display.</li>
</ol>
<p class="m-p">Below the text field you can see its width, for example <span class="m-code">Width: 25/30 (fits)</span>. The display has 30 character columns, so text wider than 30 won't fit; in that case, shorten it. The text is centered automatically, and a space between words increases the gap between them.</p>
<p class="m-p">Not every character can be shown on the display. Click <span class="m-btn"><i class="ico" data-icon="text"></i>Allowed characters</span> to see the list of characters you can use (the same button, now labelled <span class="m-btn">Hide</span>, hides the list). If you type a character that isn't allowed, the editor points it out in a message.</p>
<div class="m-warn"><p class="m-p">As long as the text contains characters that aren't allowed or doesn't fit, changes are not saved. Fix the text and it will be saved automatically.</p></div>
<p class="m-p">A text logo can be shown in two ways. The display always shows it as text made of dots. The host screen, however, can show the same text as ordinary curved lettering styled like the Familiada logo, or in pixel form, depending on the option chosen in the game settings (<a class="m-ref" href="#r8-5">chapter 8.5</a>).</p>

<h3 class="m-h2" id="r8-3">8.3 Drawing a logo</h3>
<p class="m-p">In drawing mode, you create a logo from lines, shapes and text. On the <span class="m-page">My logos</span> page, choose the <span class="m-btn">Drawing</span> tab, click the <span class="m-strong">New drawn logo</span> tile, enter a name and click <span class="m-btn">Save</span>.</p>
<p class="m-p">You draw on a canvas with the proportions of the display, in two colors: white and black. White elements light up the display dots, black ones stay unlit. Hover over a button to see its name and keyboard shortcut.</p>
<h4 class="m-h3" id="r8-3-1">8.3.1 Tools</h4>
<div class="m-table-wrap"><table class="m-table">
  <thead><tr><th>Button</th><th>What it does</th><th>Shortcut</th></tr></thead>
  <tbody>
    <tr><td><span class="m-btn"><i class="ico" data-icon="cursor"></i>Pointer</span></td><td>Select and move elements. You can also move a selected element with the arrow keys (with <kbd class="m-kbd">Shift</kbd> for a bigger step).</td><td><kbd class="m-kbd">V</kbd> or hold <kbd class="m-kbd">Ctrl</kbd></td></tr>
    <tr><td><span class="m-btn"><i class="ico" data-icon="hand"></i>Hand</span></td><td>Move the zoomed-in view of the canvas.</td><td><kbd class="m-kbd">H</kbd> or hold <kbd class="m-kbd">Space</kbd></td></tr>
    <tr><td><span class="m-btn"><i class="ico" data-icon="zoom-in"></i>Zoom in</span>, <span class="m-btn"><i class="ico" data-icon="zoom-out"></i>Zoom out</span></td><td>Change the canvas zoom.</td><td><kbd class="m-kbd">Ctrl</kbd> + <kbd class="m-kbd">+</kbd>, <kbd class="m-kbd">Ctrl</kbd> + <kbd class="m-kbd">−</kbd></td></tr>
    <tr><td><span class="m-btn">Canvas background</span></td><td>Switches the canvas background between black and white.</td><td>—</td></tr>
    <tr><td><span class="m-btn"><i class="ico" data-icon="brush"></i>Brush</span></td><td>Freehand drawing.</td><td><kbd class="m-kbd">B</kbd></td></tr>
    <tr><td><span class="m-btn"><i class="ico" data-icon="eraser"></i>Eraser</span></td><td>Removes whole elements it touches.</td><td><kbd class="m-kbd">E</kbd></td></tr>
    <tr><td><span class="m-btn"><i class="ico" data-icon="shapes"></i>Shapes</span></td><td>Pick a shape and drag it on the canvas.</td><td><kbd class="m-kbd">S</kbd>, <kbd class="m-kbd">U</kbd> (change shape)</td></tr>
    <tr><td><span class="m-btn"><i class="ico" data-icon="text"></i>Text</span></td><td>Click the canvas to add text.</td><td><kbd class="m-kbd">T</kbd></td></tr>
    <tr><td><span class="m-btn"><i class="ico" data-icon="undo"></i>Undo</span>, <span class="m-btn"><i class="ico" data-icon="redo"></i>Redo</span></td><td>Undoes the last change or restores an undone one.</td><td><kbd class="m-kbd">Ctrl</kbd> + <kbd class="m-kbd">Z</kbd>, <kbd class="m-kbd">Ctrl</kbd> + <kbd class="m-kbd">Y</kbd></td></tr>
    <tr><td><span class="m-btn"><i class="ico" data-icon="duplicate"></i>Duplicate</span></td><td>Creates a copy of the selected elements.</td><td><kbd class="m-kbd">Ctrl</kbd> + <kbd class="m-kbd">D</kbd></td></tr>
    <tr><td><span class="m-btn"><i class="ico" data-icon="trash"></i>Clear</span></td><td>Removes everything from the canvas (after you confirm).</td><td>—</td></tr>
    <tr><td><span class="m-btn"><i class="ico" data-icon="eye"></i>Preview</span></td><td>Shows how the logo will look on the display.</td><td>—</td></tr>
  </tbody>
</table></div>
<p class="m-p">On a Mac, use <kbd class="m-kbd">⌘</kbd> instead of <kbd class="m-kbd">Ctrl</kbd>; redo is <kbd class="m-kbd">⌘</kbd> + <kbd class="m-kbd">Shift</kbd> + <kbd class="m-kbd">Z</kbd>.</p>
<h4 class="m-h3" id="r8-3-2">8.3.2 Tool and element settings</h4>
<p class="m-p">Below the toolbar there is a row of settings. What it contains depends on the selected tool or element:</p>
<ul class="m-ul">
  <li><span class="m-strong">Brush</span>: width, line style (solid, dashed, dotted, dash-dot) and color,</li>
  <li><span class="m-strong">Eraser</span>: size,</li>
  <li><span class="m-strong">Shapes</span>: shape type (including line, rectangle, ellipse, triangle, star, heart, arrows and polygon), width, line style, color and fill,</li>
  <li><span class="m-strong">Text</span>: font (with search), size, line height, letter spacing, bold, italic, underline, alignment and color.</li>
</ul>
<p class="m-p">If you hold <kbd class="m-kbd">Shift</kbd> while drawing a shape, you get a square or a circle, and lines and arrows snap to 15° steps. To create a polygon, click each corner in turn; finish it with the <span class="m-btn"><i class="ico" data-icon="check"></i>Finish polygon</span> button or the <kbd class="m-kbd">Enter</kbd> key.</p>
<p class="m-p">To delete selected elements, click <span class="m-btn"><i class="ico" data-icon="close"></i></span> in the settings row or press <kbd class="m-kbd">Delete</kbd> (on a Mac, <kbd class="m-kbd">Fn</kbd> + <kbd class="m-kbd">Backspace</kbd>). The undo history covers the current editing session only: when you open the logo again, it starts fresh.</p>
<div class="m-note"><p class="m-p">The display has only 150 × 70 dots, and there are gaps between groups of dots. Thick shapes, large letters and strong contrast work best. Thin lines and small details may disappear, so check them in the preview.</p></div>
<p class="m-p">A drawn logo can be shown on the host screen in its original form, as a smooth drawing instead of dots, if you choose that option in the game settings (<a class="m-ref" href="#r8-5">chapter 8.5</a>).</p>

<h3 class="m-h2" id="r8-4">8.4 Creating a logo from an image</h3>
<p class="m-p">If you already have a picture, for example a company logo or a photo, you can turn it into a dot logo. On the <span class="m-page">My logos</span> page, choose the <span class="m-btn">Image</span> tab, click the <span class="m-strong">New logo from image</span> tile, enter a name and click <span class="m-btn">Save</span>. Then:</p>
<ol class="m-ol">
  <li>Click <span class="m-btn"><i class="ico" data-icon="folder"></i>Choose image</span> and select a JPG, PNG, GIF or WEBP file up to 5 MB.</li>
  <li>In the <span class="m-page">Display area</span> panel, place the frame over the part of the image you want on the display. Drag the frame to move it and use the corner handles to resize it; on a touch screen you can also use two fingers. The frame always keeps the proportions of the display.</li>
  <li>Watch the result next to it, in the <span class="m-page">Preview as on the display</span> panel. Clicking the preview opens it full screen.</li>
</ol>
<p class="m-p">On the toolbar, you can adjust the image:</p>
<ul class="m-ul">
  <li><span class="m-btn"><i class="ico" data-icon="rotate-left"></i></span> and <span class="m-btn"><i class="ico" data-icon="rotate-right"></i></span>: rotate 90° left or right,</li>
  <li><span class="m-btn">Straighten</span>: a small rotation from −30° to 30°, for example for a photo taken at an angle,</li>
  <li><span class="m-btn">Brightness</span>, <span class="m-btn">Contrast</span>, <span class="m-btn">Gamma</span>: lighten, darken and sharpen the image,</li>
  <li><span class="m-btn">Black point</span> and <span class="m-btn">White point</span>: the level from which light and dark parts are treated as completely white or black,</li>
  <li><span class="m-btn">Dither</span>: the strength of dot dithering, which renders shades of grey with a denser or sparser pattern of dots,</li>
  <li><span class="m-btn">Invert</span>: swaps lit dots with unlit ones,</li>
  <li><span class="m-btn"><i class="ico" data-icon="restore"></i>Reset</span>: restores the default values of all settings.</li>
</ul>
<p class="m-p">Clicking a setting button, for example <span class="m-btn">Brightness</span>, opens a slider to change its value. The current value is shown on the button.</p>
<p class="m-p">The image the logo was made from is saved together with the logo. This lets the host screen show it in its original form if you choose that option in the game settings (<a class="m-ref" href="#r8-5">chapter 8.5</a>).</p>

<h3 class="m-h2" id="r8-5">8.5 Saving, choosing and displaying a logo</h3>
<h4 class="m-h3" id="r8-5-1">8.5.1 Saving</h4>
<p class="m-p">The logo editor has no save button: changes are saved automatically shortly after you make them and when you leave the editor. You can go back at any time with the <span class="m-btn"><i class="ico" data-icon="arrow-left"></i>Back</span> button and finish later. You can rename the logo in the <span class="m-strong">Name</span> field above the editor or on the logo list.</p>
<div class="m-note"><p class="m-p">A logo can only be edited in one place at a time. If the same logo is open in another tab, or a game is being played or a game's settings are being edited, the service lets you know and pauses editing so that changes aren't overwritten.</p></div>
<h4 class="m-h3" id="r8-5-2">8.5.2 Choosing a logo for a game</h4>
<p class="m-p">You choose the logo separately for each game, in its settings: open <span class="m-page">Game settings</span>, go to the <span class="m-strong">Display</span> section and click the tile of the logo you want in the <span class="m-strong">Logo</span> field. The <span class="m-strong">Default</span> tile means the standard FAMILIADA logo. This section is described in detail in <a class="m-ref" href="#r16-3">chapter 16.3</a>.</p>
<h4 class="m-h3" id="r8-5-3">8.5.3 How the logo looks on the screens</h4>
<p class="m-p">The players' display always shows the logo as dots, because it is a dot board: exactly as in the editor's preview.</p>
<p class="m-p">The host screen can show the logo in two ways, depending on the <span class="m-strong">Host logo</span> option in the game settings:</p>
<ul class="m-ul">
  <li><span class="m-btn">Pixels</span>: the same dot form as on the Display,</li>
  <li><span class="m-btn">Source</span>: the material the logo was made from: for a text logo, ordinary lettering styled like the Familiada logo; for a drawing, the original smooth drawing; and for an image logo, the original image.</li>
</ul>
<p class="m-p">The differences between these modes are described in more detail in <a class="m-ref" href="#r16-3">chapter 16.3</a>.</p>
<h4 class="m-h3" id="r8-5-4">8.5.4 When the logo appears during a game</h4>
<p class="m-p">The logo is shown at the start of the game and can be shown at the end, depending on the end screen setting (<a class="m-ref" href="#r16-6">chapter 16.6</a>). Controlling the logo display during the game is described in chapters <a class="m-ref" href="#r17-2">17.2</a> and <a class="m-ref" href="#r17-5">17.5</a>.</p>
<h4 class="m-h3" id="r8-5-5">8.5.5 Duplicating, sending, exporting and importing</h4>
<p class="m-p">At the bottom of the logo list you will find more buttons for the selected logo:</p>
<ul class="m-ul">
  <li><span class="m-btn"><i class="ico" data-icon="duplicate"></i>Duplicate</span>: creates an independent copy of the logo on your list,</li>
  <li><span class="m-btn"><i class="ico" data-icon="envelope-out"></i>Send</span>: sends a copy of the logo to a friend (<a class="m-ref" href="#r11-3">chapter 11.3</a>); copies received from friends are described in <a class="m-ref" href="#r11-4">chapter 11.4</a>,</li>
  <li><span class="m-btn"><i class="ico" data-icon="download"></i>Export</span>: downloads the logo as a <span class="m-code">.famlogo</span> file, which you can use as a backup or to move the logo to another account,</li>
  <li><span class="m-btn"><i class="ico" data-icon="upload"></i>Import</span>: adds a logo from a file. In the <span class="m-page">Import logo</span> window, click <span class="m-btn"><i class="ico" data-icon="file-doc"></i>Choose file</span>, check the preview and click <span class="m-btn"><i class="ico" data-icon="upload"></i>Import</span>. The logo goes to the tab that matches its type.</li>
</ul>
<p class="m-p">The <span class="m-btn"><i class="ico" data-icon="duplicate"></i>Duplicate</span> and <span class="m-btn"><i class="ico" data-icon="envelope-out"></i>Send</span> buttons are not available in guest mode.</p>
<div class="m-warn"><p class="m-p">Don't edit <span class="m-code">.famlogo</span> files by hand; such a file may then fail to import.</p></div>
`,
  bases: `
<h2 class="m-ch" id="r9">9. Question bases</h2>

<h3 class="m-h2" id="r9-1">9.1 What a question base is for</h3>
<p class="m-p">A question base is your library of reusable questions. You collect questions in it (with or without answers and points), organize them in folders and mark them with tags, and then pick questions from it for new games. A base <span class="m-strong">is not a ready game</span> — you cannot host it or run a poll in it. You create a game from the questions you choose (<a class="m-ref" href="#r9-8">chapter 9.8</a>).</p>
<p class="m-p">To get to your bases, go to <span class="m-page">My games</span> and click <span class="m-btn"><i class="ico" data-icon="drawer"></i>Question bases</span> on the top bar. The <span class="m-page">My question bases</span> page opens with two tabs:</p>
<ul class="m-ul">
  <li><span class="m-btn">My bases</span> — bases you own;</li>
  <li><span class="m-btn">Shared</span> — other people's bases you have access to, and invitations to bases. The number on the tab shows pending invitations. Sharing, invitations and permissions are described in <a class="m-ref" href="#r12">chapter 12</a>.</li>
</ul>
<p class="m-p">Above the list you will find a search field (by name) and a filter that narrows the list to your own bases, bases you can edit, or read-only bases.</p>

<h4 class="m-h3" id="r9-1-1">9.1.1 Creating a new base</h4>
<ol class="m-ol">
  <li>On the <span class="m-btn">My bases</span> tab, click the <span class="m-btn"><i class="ico" data-icon="plus"></i>New base</span> tile.</li>
  <li>In the <span class="m-page">New base</span> window, enter a name (up to 80 characters).</li>
  <li>Click <span class="m-btn">Save</span>. The new base appears on the list and is selected right away.</li>
</ol>

<h4 class="m-h3" id="r9-1-2">9.1.2 The base tile and actions on the list</h4>
<p class="m-p">Clicking a tile selects the base; clicking it again clears the selection. Marks on the tile tell you what kind of base it is:</p>
<ul class="m-ul">
  <li>on your own base: a single-person icon — the base is not shared with anyone; a several-people icon with a number — how many people you have shared it with;</li>
  <li>on a shared base: “From: …” with the owner's name and a permission icon — a pencil with a sheet means edit access, an eye means read-only access;</li>
  <li>“Proposed” — an invitation waiting for your decision (<a class="m-ref" href="#r12-3">chapter 12.3</a>).</li>
</ul>
<p class="m-p">Once a base is selected, you can use these buttons:</p>
<ul class="m-ul">
  <li><span class="m-btn"><i class="ico" data-icon="folder"></i>Browse</span> — opens the base content in the manager (<a class="m-ref" href="#r9-2">chapter 9.2</a>);</li>
  <li><span class="m-btn"><i class="ico" data-icon="envelope"></i>Share</span> — owner only (<a class="m-ref" href="#r12-2">chapter 12.2</a>);</li>
  <li><span class="m-btn"><i class="ico" data-icon="duplicate"></i>Duplicate</span> — creates an independent copy of your own base on the <span class="m-btn">My bases</span> tab;</li>
  <li><span class="m-btn"><i class="ico" data-icon="download"></i>Export</span> — saves the whole base (folders, questions and tags) to a <span class="m-code">.fambase</span> file; works for every base you have access to;</li>
  <li><span class="m-btn"><i class="ico" data-icon="upload"></i>Import</span> — creates a new base of your own from a <span class="m-code">.fambase</span> or <span class="m-code">.json</span> file. Pick the file with <span class="m-btn"><i class="ico" data-icon="file-doc"></i>Choose file</span>, click <span class="m-btn"><i class="ico" data-icon="upload"></i>Import</span>, and when it finishes, <span class="m-btn"><i class="ico" data-icon="check"></i>Done</span>.</li>
</ul>
<p class="m-p">To rename your own base, double-click its tile (double-tap on a phone) — the <span class="m-page">Rename base</span> window opens. To delete a base, use the <i class="ico" data-icon="trash"></i> icon in the corner of the tile; on a shared base tile this spot holds the <i class="ico" data-icon="close"></i> <span class="m-strong">Remove from list</span> icon, which gives up your access (<a class="m-ref" href="#r12-5">chapter 12.5</a>).</p>
<div class="m-warn"><p class="m-p">Deleting a base cannot be undone — all its folders, questions and tags disappear, also for the people you shared it with. Games created earlier from its questions stay.</p></div>
<div class="m-note"><p class="m-p">You cannot rename or delete a base while someone has it open in the manager with edit access — you will then see the message “The database is open — it can't be changed as a whole.” (<a class="m-ref" href="#r12-5">chapter 12.5</a>).</p></div>

<h3 class="m-h2" id="r9-2">9.2 The base explorer</h3>
<p class="m-p">The content of a base opens on the <span class="m-page">Question base manager</span> page; the base name is shown on the top bar. The manager works like a file explorer on a computer: <span class="m-strong">folders</span> organize questions, and each <span class="m-strong">question</span> is an item you can open and edit.</p>

<h4 class="m-h3" id="r9-2-1">9.2.1 Page layout</h4>
<ul class="m-ul">
  <li><span class="m-strong">Toolbar</span> at the top — a search field and icon buttons, grouped into creating, editing, clipboard, game and view. When you point at a button with the mouse, its name and keyboard shortcut appear.</li>
  <li><span class="m-strong">Left panel</span> — the folder tree (it starts with <span class="m-strong">Root folder</span>), below it the <span class="m-strong">Matching categories</span> list and the <span class="m-strong">Tags</span> list with the <span class="m-btn"><i class="ico" data-icon="plus"></i>Add tag</span> button. On a phone the panel is hidden — open it with the <i class="ico" data-icon="hamburger"></i> button at the start of the toolbar.</li>
  <li><span class="m-strong">List on the right</span> — above it, the path to the current folder; in it, folders and questions with the columns <span class="m-strong">No</span>, <span class="m-strong">Name</span>, <span class="m-strong">Type</span>, <span class="m-strong">Date</span> and <span class="m-strong">Info</span>. In the <span class="m-strong">Info</span> column a folder shows the number of items, and a question shows the number of answers plus colored dots for its tags and categories.</li>
</ul>
<p class="m-p">Clicking the <span class="m-strong">Name</span>, <span class="m-strong">Type</span> or <span class="m-strong">Date</span> column header sorts the list; clicking again reverses the order. To change a column's width, drag the edge of its header.</p>

<h4 class="m-h3" id="r9-2-2">9.2.2 Moving between folders</h4>
<ul class="m-ul">
  <li>Double-clicking a folder on the list or in the tree opens it. On a phone, double-tap.</li>
  <li>The arrow next to a folder in the tree expands or collapses it without opening it; the expanded state of the tree is remembered for each base.</li>
  <li>Clicking any item of the path above the list takes you to that folder; <span class="m-strong">Root folder</span> is the top level of the base.</li>
  <li><kbd class="m-kbd">Backspace</kbd> goes to the parent folder, and <kbd class="m-kbd">Enter</kbd> opens the selected folder (<a class="m-ref" href="#r9-6">chapter 9.6</a>).</li>
</ul>

<h4 class="m-h3" id="r9-2-3">9.2.3 Selecting items</h4>
<ul class="m-ul">
  <li>A click selects one item.</li>
  <li><kbd class="m-kbd">Ctrl</kbd> + click (on macOS <kbd class="m-kbd">⌘</kbd> + click) adds an item to the selection or removes it from the selection.</li>
  <li><kbd class="m-kbd">Shift</kbd> + click selects all items from the last clicked one to the one you point at.</li>
  <li>Dragging the mouse from an empty spot on the list draws a box and selects the items inside it.</li>
  <li><kbd class="m-kbd">Ctrl</kbd> + <kbd class="m-kbd">A</kbd> selects everything on the list, and <kbd class="m-kbd">Esc</kbd> or a click on an empty spot of the list clears the selection.</li>
</ul>
<p class="m-p">Toolbar buttons turn on depending on the selection: for example, <span class="m-strong">Edit question</span> and <span class="m-strong">Rename</span> need exactly one item, while <span class="m-strong">Copy</span> or <span class="m-strong">Delete</span> also work for several.</p>

<h4 class="m-h3" id="r9-2-4">9.2.4 Context menu</h4>
<p class="m-p">A right-click (on a phone, press and hold) opens the context menu. What it contains depends on where you click:</p>
<ul class="m-ul">
  <li>on a folder — among others <span class="m-btn"><i class="ico" data-icon="folder"></i>Open folder</span>, <span class="m-btn"><i class="ico" data-icon="folder-plus"></i>New folder in this folder</span> and <span class="m-btn"><i class="ico" data-icon="file-plus"></i>New question in this folder</span>;</li>
  <li>on a question — among others <span class="m-btn"><i class="ico" data-icon="edit-paper"></i>Edit question…</span> and <span class="m-btn"><i class="ico" data-icon="pencil"></i>Rename (text)</span>;</li>
  <li>on an empty spot of the list or tree — <span class="m-btn"><i class="ico" data-icon="folder-plus"></i>New folder</span>, <span class="m-btn"><i class="ico" data-icon="file-plus"></i>New question</span> and <span class="m-btn"><i class="ico" data-icon="paste"></i>Paste</span> in the current folder;</li>
  <li>on a tag or category in the left panel — <span class="m-btn"><i class="ico" data-icon="eye"></i>Show</span> and (for tags) adding, editing and deleting tags (<a class="m-ref" href="#r9-4">chapter 9.4</a>).</li>
</ul>
<p class="m-p">On folders and questions the menu also contains the clipboard items, <span class="m-btn"><i class="ico" data-icon="tag"></i>Tags…</span>, <span class="m-btn"><i class="ico" data-icon="gamepad"></i>Create game…</span> and <span class="m-btn"><i class="ico" data-icon="trash"></i>Delete</span>. Keyboard shortcuts are shown next to the items.</p>

<h3 class="m-h2" id="r9-3">9.3 Tools for working with questions and folders</h3>
<p class="m-p">You can do the same things with a toolbar button, from the context menu or with a keyboard shortcut. Everything that changes the content of the base requires edit access (<a class="m-ref" href="#r12-4">chapter 12.4</a>).</p>
<div class="m-table-wrap"><table class="m-table">
  <thead><tr><th>Action</th><th>What happens</th></tr></thead>
  <tbody>
    <tr><td><span class="m-btn">New folder</span></td><td>A folder named <span class="m-code">Nowy folder</span> is created in the current folder; give it a proper name with <span class="m-btn">Rename</span>.</td></tr>
    <tr><td><span class="m-btn">New question</span></td><td>A question <span class="m-code">Nowe pytanie</span> with no answers is created in the current folder; fill it in with <span class="m-btn">Edit question</span> (<a class="m-ref" href="#r9-7">chapter 9.7</a>).</td></tr>
    <tr><td><span class="m-btn">Edit question</span></td><td>Opens the edit window for the one selected question. Double-clicking a question does the same.</td></tr>
    <tr><td><span class="m-btn">Tags</span></td><td>Opens the window for assigning tags to the selected items (<a class="m-ref" href="#r9-4">chapter 9.4</a>).</td></tr>
    <tr><td><span class="m-btn">Rename</span></td><td>For a folder, changes its name (up to 80 characters); for a question, its text. Works for one selected item.</td></tr>
    <tr><td><span class="m-btn">Delete</span></td><td>After confirmation, deletes the selected items. Deleting a folder also deletes all its subfolders and questions.</td></tr>
    <tr><td><span class="m-btn">Copy</span></td><td>Remembers the selected items to paste them as copies.</td></tr>
    <tr><td><span class="m-btn">Cut</span></td><td>Remembers the selected items to move them; the move happens only when you paste.</td></tr>
    <tr><td><span class="m-btn">Paste</span></td><td>Pastes the remembered items into the current folder. Copied questions keep their answers, points and tags; a copied folder comes with all its content.</td></tr>
    <tr><td><span class="m-btn">Duplicate</span></td><td>Immediately creates copies of the selected items in the current folder. A folder copy gets the suffix <span class="m-code">(kopia)</span> if there is already a folder with that name next to it.</td></tr>
    <tr><td><span class="m-btn">Create game</span></td><td>Opens game creation from the selected questions and folders (<a class="m-ref" href="#r9-8">chapter 9.8</a>).</td></tr>
    <tr><td><span class="m-btn">Refresh view</span></td><td>Loads the current view again — useful when several people are working on the base (<a class="m-ref" href="#r12-5">chapter 12.5</a>).</td></tr>
  </tbody>
</table></div>
<div class="m-warn"><p class="m-p">Deleted questions and folders cannot be restored.</p></div>
<div class="m-note"><p class="m-p">The manager's clipboard works only within the open base and does not use the system clipboard — you cannot paste copied questions into another program. Cut and paste do not work in search results or in the tag or category view.</p></div>

<h4 class="m-h3" id="r9-3-1">9.3.1 Dragging items</h4>
<p class="m-p">You can drag folders and questions with the mouse:</p>
<ul class="m-ul">
  <li>dropping onto a folder (on the list or in the tree) <span class="m-strong">moves</span> the selected items into that folder, and dropping onto <span class="m-strong">Root folder</span> moves them to the top level of the base;</li>
  <li>holding <kbd class="m-kbd">Ctrl</kbd> while dropping (on macOS <kbd class="m-kbd">⌥ Option</kbd>) <span class="m-strong">copies</span> the items instead of moving them;</li>
  <li>in the tree, a folder dropped just above or just below another folder changes the order of folders;</li>
  <li>dropping onto a tag in the left panel assigns that tag to the dragged items (<a class="m-ref" href="#r9-4">chapter 9.4</a>).</li>
</ul>
<p class="m-p">You cannot move a folder into itself or into one of its subfolders.</p>

<h3 class="m-h2" id="r9-4">9.4 Folders and tags</h3>

<h4 class="m-h3" id="r9-4-1">9.4.1 Folders</h4>
<p class="m-p">A folder can contain questions and further folders, so you can group questions on several levels, for example <span class="m-code">Sports</span> → <span class="m-code">Football</span>. To create a subfolder, open the parent folder and use <span class="m-btn">New folder</span>, or choose <span class="m-btn"><i class="ico" data-icon="folder-plus"></i>New folder in this folder</span> from the folder's context menu. You move questions into folders by dragging or with <span class="m-btn">Cut</span> and <span class="m-btn">Paste</span> (<a class="m-ref" href="#r9-3">chapter 9.3</a>).</p>

<h4 class="m-h3" id="r9-4-2">9.4.2 Tags</h4>
<p class="m-p">Tags are colored labels you use to mark questions regardless of their folder — for example by topic, difficulty or occasion. One question can have many tags. Tags belong to the base, so each base has its own set.</p>
<p class="m-p"><span class="m-strong">Creating a tag:</span></p>
<ol class="m-ol">
  <li>Click <span class="m-btn"><i class="ico" data-icon="plus"></i>Add tag</span> in the left panel (or the same button in the <span class="m-page">Tags</span> window).</li>
  <li>Enter a name — up to 40 characters, no spaces. Allowed are letters without diacritics, digits and the underscore <span class="m-code">_</span>, for example <span class="m-code">for_kids</span>. The name cannot repeat an existing tag.</li>
  <li>Click the <span class="m-strong">Color</span> tile, pick a color with the R, G, B sliders or type a code in the <span class="m-strong">HEX</span> field (format <span class="m-code">#RRGGBB</span>), and click <span class="m-btn"><i class="ico" data-icon="save"></i>Save</span>.</li>
  <li>Click <span class="m-btn"><i class="ico" data-icon="save"></i>Save</span> to create the tag.</li>
</ol>
<p class="m-p">You can change a tag's name and color from the tag's context menu in the left panel (<span class="m-btn"><i class="ico" data-icon="pencil"></i>Edit tag…</span>). You can also delete a tag there; its assignments to questions and folders disappear with it.</p>
<p class="m-p"><span class="m-strong">Assigning tags:</span></p>
<ol class="m-ol">
  <li>Select one or more questions or folders.</li>
  <li>Click <span class="m-btn">Tags</span> on the toolbar or choose <span class="m-btn"><i class="ico" data-icon="tag"></i>Tags…</span> from the context menu.</li>
  <li>In the <span class="m-page">Tags</span> window, check or uncheck tags. A tag marked “partial” is assigned to only some of the selected questions; clicking it assigns it to all of them.</li>
  <li>Click <span class="m-btn"><i class="ico" data-icon="save"></i>Save</span>.</li>
</ol>
<p class="m-p">A tag assigned to a folder goes to all questions in that folder and its subfolders. A folder shows a tag's dot when all questions in it have that tag. A quicker way to assign a tag is to drag the selected items onto the tag in the left panel.</p>

<h4 class="m-h3" id="r9-4-3">9.4.3 Matching categories</h4>
<p class="m-p">The <span class="m-strong">Matching categories</span> list contains fixed labels that you do not create yourself. Familiada judges on its own which type of game a question is already suitable for:</p>
<ul class="m-ul">
  <li><span class="m-strong">standard</span> — every question; it suits a standard poll, where answers are collected later;</li>
  <li><span class="m-strong">scored</span> — the question has 3 to 6 answers, so it suits a “Scored” game;</li>
  <li><span class="m-strong">prepared</span> — the question has 3 to 6 answers, each worth at least 4 points, and the points total no more than 100.</li>
</ul>
<p class="m-p">One question can match several categories at once. Categories are for filtering (<a class="m-ref" href="#r9-5">chapter 9.5</a>) and do not block anything. The readiness conditions for games are described in <a class="m-ref" href="#r7-6">chapter 7.6</a>.</p>

<h3 class="m-h2" id="r9-5">9.5 Searching and browsing questions</h3>

<h4 class="m-h3" id="r9-5-1">9.5.1 Searching by text</h4>
<p class="m-p">Start typing in the <span class="m-strong">Search...</span> field on the toolbar — results appear as you type. The search covers the whole base, regardless of the open folder, and finds questions whose text contains what you typed, as well as folders with a matching name. Upper and lower case do not matter.</p>
<p class="m-p">You can also type a tag in the field by putting <span class="m-code">#</span> before its full name and then pressing space, comma or <kbd class="m-kbd">Enter</kbd>. The tag turns into a colored label in the field, and the results are limited to questions with that tag. Clicking the label removes it, and so does <kbd class="m-kbd">Backspace</kbd> at the start of an empty field.</p>

<h4 class="m-h3" id="r9-5-2">9.5.2 Browsing by tag or category</h4>
<ul class="m-ul">
  <li>Clicking a tag or category in the left panel shows the questions with that label from the whole base.</li>
  <li><kbd class="m-kbd">Ctrl</kbd> + click (on macOS <kbd class="m-kbd">⌘</kbd> + click) adds more labels — you then see only questions that have <span class="m-strong">all</span> the chosen labels. <kbd class="m-kbd">Shift</kbd> + click selects a range.</li>
  <li>A folder appears in the results when all questions in it match; questions from such a folder are then not listed separately.</li>
</ul>
<p class="m-p">In search results and in the tag or category view you cannot create new items or paste. In the tag view, the <kbd class="m-kbd">Delete</kbd> key and the <span class="m-btn"><i class="ico" data-icon="trash"></i>Delete tags</span> item in the context menu remove the chosen tags from the selected items, but do not delete the items.</p>

<h4 class="m-h3" id="r9-5-3">9.5.3 How to recognize the view and return to the full list</h4>
<ul class="m-ul">
  <li><span class="m-strong">Browsing folders</span> — above the list you see a path starting from <span class="m-strong">Root folder</span>, and the open folder is bold in the tree.</li>
  <li><span class="m-strong">Search results</span> — the path disappears, the search field shows text or tag labels, and the button next to the field changes from a magnifying glass to <i class="ico" data-icon="close"></i>.</li>
  <li><span class="m-strong">Tag or category view</span> — the path disappears, and the chosen labels are highlighted in the left panel.</li>
</ul>
<p class="m-p">To go back to where you were before searching, click <i class="ico" data-icon="close"></i> (<span class="m-strong">Clear</span>) next to the search field or clear the field. To clear the choice of tags and categories, click an empty spot of the left panel. While searching or with tags chosen, clicking the folder tree first clears the filter and returns to browsing folders.</p>

<h3 class="m-h2" id="r9-6">9.6 Keyboard shortcuts</h3>
<p class="m-p">The most important actions in the base manager have keyboard shortcuts. Shortcuts that change the content work only with edit access.</p>
<div class="m-table-wrap"><table class="m-table">
  <thead><tr><th>Action</th><th>Windows / Linux</th><th>macOS</th></tr></thead>
  <tbody>
    <tr><td><span class="m-strong">Edit</span></td><td></td><td></td></tr>
    <tr><td>Edit question</td><td><kbd class="m-kbd">Ctrl</kbd> + <kbd class="m-kbd">E</kbd></td><td><kbd class="m-kbd">⌘</kbd> <kbd class="m-kbd">E</kbd></td></tr>
    <tr><td>Rename</td><td><kbd class="m-kbd">F2</kbd></td><td><kbd class="m-kbd">F2</kbd></td></tr>
    <tr><td>Delete</td><td><kbd class="m-kbd">Delete</kbd></td><td><kbd class="m-kbd">Fn</kbd> + <kbd class="m-kbd">⌫</kbd></td></tr>
    <tr><td><span class="m-strong">Clipboard</span></td><td></td><td></td></tr>
    <tr><td>Copy</td><td><kbd class="m-kbd">Ctrl</kbd> + <kbd class="m-kbd">C</kbd></td><td><kbd class="m-kbd">⌘</kbd> <kbd class="m-kbd">C</kbd></td></tr>
    <tr><td>Cut</td><td><kbd class="m-kbd">Ctrl</kbd> + <kbd class="m-kbd">X</kbd></td><td><kbd class="m-kbd">⌘</kbd> <kbd class="m-kbd">X</kbd></td></tr>
    <tr><td>Paste</td><td><kbd class="m-kbd">Ctrl</kbd> + <kbd class="m-kbd">V</kbd></td><td><kbd class="m-kbd">⌘</kbd> <kbd class="m-kbd">V</kbd></td></tr>
    <tr><td>Duplicate</td><td><kbd class="m-kbd">Ctrl</kbd> + <kbd class="m-kbd">D</kbd></td><td><kbd class="m-kbd">⌘</kbd> <kbd class="m-kbd">D</kbd></td></tr>
    <tr><td><span class="m-strong">Navigation and selection</span></td><td></td><td></td></tr>
    <tr><td>Open selected folder</td><td><kbd class="m-kbd">Enter</kbd></td><td><kbd class="m-kbd">⏎</kbd></td></tr>
    <tr><td>Parent folder</td><td><kbd class="m-kbd">Backspace</kbd></td><td><kbd class="m-kbd">⌫</kbd></td></tr>
    <tr><td>Select everything on the list</td><td><kbd class="m-kbd">Ctrl</kbd> + <kbd class="m-kbd">A</kbd></td><td><kbd class="m-kbd">⌘</kbd> <kbd class="m-kbd">A</kbd></td></tr>
    <tr><td>Clear selection</td><td><kbd class="m-kbd">Esc</kbd></td><td><kbd class="m-kbd">Esc</kbd></td></tr>
    <tr><td><span class="m-strong">Creating a game</span></td><td></td><td></td></tr>
    <tr><td>Create game</td><td><kbd class="m-kbd">Ctrl</kbd> + <kbd class="m-kbd">G</kbd></td><td><kbd class="m-kbd">⌘</kbd> <kbd class="m-kbd">G</kbd></td></tr>
  </tbody>
</table></div>
<div class="m-note"><p class="m-p">Shortcuts do not work while you are typing in the search field or in the fields of edit windows — the keys then work as in any text field. New questions, folders and tags are easiest to create with toolbar buttons or from the context menu.</p></div>

<h3 class="m-h2" id="r9-7">9.7 Editing a question</h3>
<p class="m-p">Open a question by double-clicking it, with the <span class="m-btn">Edit question</span> button or with <kbd class="m-kbd">Ctrl</kbd> + <kbd class="m-kbd">E</kbd>. In the <span class="m-page">Question</span> window:</p>
<ol class="m-ol">
  <li>In the <span class="m-strong">Question text</span> field, type or correct the question.</li>
  <li>Use the <span class="m-strong">Add answer</span> tile to add more answers — up to 6. You can delete any answer with the button in its row.</li>
  <li>You can enter points next to the answers. In a base they are <span class="m-strong">optional</span>: an empty field means no points, and an entered value must be between 0 and 100. The question's points total, shown above the answer list, cannot exceed 100.</li>
  <li>Click <span class="m-btn"><i class="ico" data-icon="save"></i>Save</span>.</li>
</ol>
<p class="m-p">The question text cannot be empty, and every added answer must have text and contain only characters the Display can show. A question in a base can have fewer than 3 answers or none at all — the gaps are shown only when you create a game (<a class="m-ref" href="#r9-8">chapter 9.8</a>). Length limits for questions and answers and the rules for preparing content are the same as in the game editor (<a class="m-ref" href="#r7-3">chapter 7.3</a> and <a class="m-ref" href="#r7-4">chapter 7.4</a>).</p>
<p class="m-p">If you close the window without saving after making changes, Familiada asks: “Discard unsaved changes to this question?” — <span class="m-btn">Discard</span> closes the window without saving, and <span class="m-btn">Keep editing</span> takes you back to editing. You can also quickly change just the question text with <span class="m-btn">Rename</span> (<kbd class="m-kbd">F2</kbd>).</p>
<p class="m-p">Tags are assigned separately, in the <span class="m-page">Tags</span> window (<a class="m-ref" href="#r9-4">chapter 9.4</a>).</p>

<h3 class="m-h2" id="r9-8">9.8 Creating a game from selected questions</h3>
<p class="m-p">You can create a new game straight from the questions in a base. The game is made <span class="m-strong">exactly from the questions you choose</span> — Familiada does not add anything.</p>
<ol class="m-ol">
  <li>Select questions or folders. A selected folder brings in all questions from its subfolders.</li>
  <li>Click <span class="m-btn">Create game</span> on the toolbar, choose <span class="m-btn"><i class="ico" data-icon="gamepad"></i>Create game…</span> from the context menu, or press <kbd class="m-kbd">Ctrl</kbd> + <kbd class="m-kbd">G</kbd>.</li>
  <li>In the <span class="m-page">Export game</span> window, enter the <span class="m-strong">Game name</span> (up to 60 characters). When you create a game from a single folder, its name is suggested.</li>
  <li>Choose the <span class="m-strong">Game type</span> with the slider: <span class="m-strong">Standard poll</span>, <span class="m-strong">Scored</span> or <span class="m-strong">Prepared</span>.</li>
  <li>Check the <span class="m-strong">Questions</span> list. It contains the whole base, and the questions you chose are checked — you can still check or uncheck individual questions. The <span class="m-strong">SELECTED</span> counter shows how many questions will go into the game.</li>
  <li>Click <span class="m-btn"><i class="ico" data-icon="file-plus"></i>Create</span>. Once the game is created, you go to the <span class="m-page">My games</span> page.</li>
</ol>
<p class="m-p">Before you confirm, the window shows what still needs work. Each question shows its number of answers (and for a prepared game also the points total) and any gap, for example “needs 3–6 answers”. A summary appears under the slider: “Ready once created.” or “A draft will be created. Missing for ready: …”.</p>
<p class="m-p">The game type decides what goes into the game:</p>
<ul class="m-ul">
  <li><span class="m-strong">Standard poll</span> — only the question texts go in; answers from the base are skipped, because the poll will collect them;</li>
  <li><span class="m-strong">Scored</span> — questions and answers go in, but without points; the points will come from a later poll;</li>
  <li><span class="m-strong">Prepared</span> — questions, answers and points go in.</li>
</ul>
<p class="m-p">The game type does not limit the list of questions — you can choose any, including ones that do not meet its conditions yet. You do not need 10 questions or a full set of answers and points to create a game: a draft is created, which you complete in the game editor (<a class="m-ref" href="#r7">chapter 7</a>, readiness conditions: <a class="m-ref" href="#r7-6">chapter 7.6</a>). If you uncheck all questions, an empty game is created.</p>
<div class="m-note"><p class="m-p">The game is an independent copy of the chosen questions. Later changes in the base do not change the created game, and changes in the game do not go back to the base. To move questions from a game into a base, use the export described in <a class="m-ref" href="#r6-7">chapter 6.7</a>.</p></div>

<h2 class="m-ch" id="r12">12. Sharing and co-editing question bases</h2>

<h3 class="m-h2" id="r12-1">12.1 How base sharing works</h3>
<p class="m-p">The owner can share their question base with other people. Everyone then uses <span class="m-strong">the same base</span>: questions, folders and tags added or changed by one person are seen by the others. This is how sharing differs from sending a copy of a game or logo (<a class="m-ref" href="#r11">chapter 11</a>), where the recipient gets a separate copy, independent of the original.</p>
<p class="m-p">A base can be shared only with a person who has an account (not a guest account). On a guest account, the <span class="m-btn">Shared</span> tab and the <span class="m-btn"><i class="ico" data-icon="envelope"></i>Share</span> button are not available.</p>

<h3 class="m-h2" id="r12-2">12.2 Inviting people to a base</h3>
<ol class="m-ol">
  <li>On the <span class="m-page">My question bases</span> page, select your base and click <span class="m-btn"><i class="ico" data-icon="envelope"></i>Share</span>. The <span class="m-page">Share base</span> window opens.</li>
  <li>At the bottom of the window, set the permission for new invitations. Clicking the button switches between <span class="m-btn"><i class="ico" data-icon="edit-paper"></i>Can edit</span> and <span class="m-btn"><i class="ico" data-icon="eye"></i>View only</span> (on a narrow screen: <span class="m-strong">Edit</span> / <span class="m-strong">View</span>). <span class="m-strong">Can edit</span> is set by default. Access levels are described in <a class="m-ref" href="#r12-4">chapter 12.4</a>.</li>
  <li>Choose the recipients:
    <ul class="m-ul">
      <li>in the <span class="m-strong">Friends</span> section, check people on your friends list (you can check or uncheck everyone at once) and click <span class="m-btn"><i class="ico" data-icon="people"></i>Share with selected</span> — the number in brackets shows how many are checked;</li>
      <li>or in the <span class="m-strong">Email or username</span> section, enter the email address or username of a person with an account and click <span class="m-btn"><i class="ico" data-icon="envelope-out"></i>Share</span> (or press <kbd class="m-kbd">Enter</kbd>).</li>
    </ul>
  </li>
</ol>
<p class="m-p">A sent invitation appears in the <span class="m-strong">Shared</span> section of this window with the status “Pending”. The recipient also gets an email with a “View invitation” button, unless they have turned off such notifications (<a class="m-ref" href="#r14">chapter 14</a>). An invitation with no answer expires after 5 days.</p>
<p class="m-p">For a pending invitation you can:</p>
<ul class="m-ul">
  <li>change the permission with the role button in its row;</li>
  <li>send a reminder with <span class="m-btn"><i class="ico" data-icon="refresh"></i>Resend</span> (when the recipient accepts email notifications); after sending, the button is inactive for a while, and a countdown shows when you can use it again;</li>
  <li>withdraw it with the <i class="ico" data-icon="trash"></i> button.</li>
</ul>
<p class="m-p">Familiada will not send an invitation when the person already has access to the base (“This person already has access to the base.”), when an invitation is already waiting for them (“An invite is already pending.”), or when they recently declined an invitation to this base — the window then shows how long until you can share again. Declining blocks further invitations to this base for up to 30 days.</p>

<h3 class="m-h2" id="r12-3">12.3 Accepting an invitation and opening the base</h3>
<p class="m-p">A new invitation is shown by a number on the <span class="m-btn"><i class="ico" data-icon="drawer"></i>Question bases</span> button on the <span class="m-page">My games</span> page and on the <span class="m-btn">Shared</span> tab. The invitation appears as a tile marked “Proposed”, with the sender's name (“From: …”) and an icon of the proposed permission.</p>
<ul class="m-ul">
  <li>Click <i class="ico" data-icon="check"></i> (<span class="m-strong">Accept</span>) on the tile to accept the invitation. The base stays on the <span class="m-btn">Shared</span> tab, and you can open it with <span class="m-btn"><i class="ico" data-icon="folder"></i>Browse</span>.</li>
  <li>Click <i class="ico" data-icon="close"></i> (<span class="m-strong">Decline</span>) to refuse. A declined invitation goes to the <span class="m-strong">Declined by me</span> section below the list of bases; for 30 days you can restore it there with <span class="m-btn"><i class="ico" data-icon="undo"></i>Undo decline</span> — it then comes back as a pending invitation.</li>
</ul>
<p class="m-p">Invitations to bases also appear on the <span class="m-page">Tasks</span> page, where you accept them with <span class="m-btn">Accept</span> or decline them with <span class="m-btn">Decline</span> (<a class="m-ref" href="#r15-4">chapter 15.4</a>). The button in the email takes you to the <span class="m-page">My question bases</span> page and selects the invitation tile.</p>
<div class="m-note"><p class="m-p">If, after clicking the link in the email, you see a message that the share belongs to a different user, log in to the account tied to the address that received the email. Familiada also tells you when the invitation has expired, was cancelled, or was already accepted or declined.</p></div>
<p class="m-p">Until the invitation is accepted, the base cannot be opened or exported.</p>

<h3 class="m-h2" id="r12-4">12.4 Access levels</h3>
<div class="m-table-wrap"><table class="m-table">
  <thead><tr><th>What you can do</th><th>Owner</th><th>Can edit</th><th>View only</th></tr></thead>
  <tbody>
    <tr><td>Open the base, browse folders, search and filter</td><td>yes</td><td>yes</td><td>yes</td></tr>
    <tr><td>Open and edit questions; create, move, copy and delete questions and folders</td><td>yes</td><td>yes</td><td>no</td></tr>
    <tr><td>Create, edit, assign and delete tags</td><td>yes</td><td>yes</td><td>no</td></tr>
    <tr><td>Create a game from the base's questions</td><td>yes</td><td>yes</td><td>no</td></tr>
    <tr><td>Export the whole base to a file</td><td>yes</td><td>yes</td><td>yes</td></tr>
    <tr><td>Rename, duplicate and delete the base</td><td>yes</td><td>no</td><td>no</td></tr>
    <tr><td>Invite people, change permissions and revoke access</td><td>yes</td><td>no</td><td>no</td></tr>
    <tr><td>Give up access (<span class="m-strong">Remove from list</span>)</td><td>—</td><td>yes</td><td>yes</td></tr>
  </tbody>
</table></div>
<p class="m-p">A person with <span class="m-strong">view-only</span> access sees the list of questions and folders with the number of answers, tags and categories, but cannot open the question window or create a game from the base. If they want to use the questions in their own games, they can export the base to a file and import it as their own copy (<a class="m-ref" href="#r9-1-2">chapter 9.1.2</a>). Working with questions is described in <a class="m-ref" href="#r9">chapter 9</a>.</p>

<h3 class="m-h2" id="r12-5">12.5 Working together and managing access</h3>

<h4 class="m-h3" id="r12-5-1">12.5.1 Seeing changes</h4>
<p class="m-p">Several people can have the same base open at the same time. You see your own changes on your screen right away, but the manager does not pull in changes made by others in the meantime on its own — click <span class="m-btn">Refresh view</span> on the toolbar or go to another folder to see the current content. The list on the <span class="m-page">My question bases</span> page refreshes itself every few seconds.</p>

<h4 class="m-h3" id="r12-5-2">12.5.2 Messages about busy items</h4>
<p class="m-p">So that two people do not overwrite each other's work, an item someone is editing right now is temporarily busy. This also applies to your other browser tabs and devices.</p>
<div class="m-table-wrap"><table class="m-table">
  <thead><tr><th>Message</th><th>What it means and what to do</th></tr></thead>
  <tbody>
    <tr><td>“This database item is currently being edited in another tab or by another user.”</td><td>Someone has this question open, is renaming the folder or is working on the tag, and you want to edit, move or delete it. Try again when they are done.</td></tr>
    <tr><td>“What you're trying to open was deleted elsewhere in the meantime.”</td><td>Someone deleted the item before you opened or saved it. Refresh the view.</td></tr>
    <tr><td>“The database is open — it can't be changed as a whole.”</td><td>The owner wants to rename or delete the base, but someone has it open in the manager with edit access. You need to wait until that person closes the base.</td></tr>
    <tr><td>“The whole database is being changed.”</td><td>The owner is renaming or deleting the base right now, so the manager cannot be opened at the moment. Try again in a moment.</td></tr>
    <tr><td>“Your access to this database was revoked.”</td><td>The owner revoked your access while the base was open. Go back to the list of bases.</td></tr>
  </tbody>
</table></div>
<p class="m-p">The owner also cannot delete the base while someone is editing a question, folder or tag in it — Familiada tells you so.</p>

<h4 class="m-h3" id="r12-5-3">12.5.3 Changing and revoking access (owner)</h4>
<ol class="m-ol">
  <li>Select the base and click <span class="m-btn"><i class="ico" data-icon="envelope"></i>Share</span>.</li>
  <li>Find the person in the <span class="m-strong">Shared</span> section. Their status is “Accepted”, “Pending” or “Declined”.</li>
  <li>To change the permission, click the role button in their row — it switches between <span class="m-strong">Can edit</span> and <span class="m-strong">View only</span>.</li>
  <li>To revoke access, click <i class="ico" data-icon="trash"></i> in their row.</li>
</ol>
<p class="m-p">After access is revoked, the base disappears from that person's <span class="m-btn">Shared</span> tab and they cannot open it any more. If they had it open with edit access, they see the message “Access revoked”. Games they created earlier from the base's questions, and files they exported, stay with them. A new permission after a role change takes full effect when the collaborator opens the base again.</p>

<h4 class="m-h3" id="r12-5-4">12.5.4 Leaving a shared base</h4>
<p class="m-p">If you no longer want to use someone else's base, click <i class="ico" data-icon="close"></i> in the corner of its tile on the <span class="m-btn">Shared</span> tab and confirm with <span class="m-btn">Remove</span>. You lose access to the base, and its content stays unchanged for the owner and the other people. Your withdrawal goes to the <span class="m-strong">Declined by me</span> section — for 30 days you can undo it with <span class="m-btn"><i class="ico" data-icon="undo"></i>Undo decline</span> and accept the invitation again.</p>
`,
  people: `
<h2 class="m-ch" id="r10">10. Friends and managing friendships</h2>

<h3 class="m-h2" id="r10-1">10.1 Who is a friend</h3>
<p class="m-p">A friend is another Familiada user who has their own account and accepted your invitation (or whose invitation you accepted). A friendship always goes both ways: it is created only after acceptance, and both people see each other on their friends lists.</p>
<p class="m-p">Do not confuse friends with subscribers. A subscriber is a person <span class="m-strong">without an account</span> who agreed to receive poll invitations from you by email. Subscriptions are described in <a class="m-ref" href="#r14">chapter 14</a>.</p>
<p class="m-p">You manage your friends list on the <span class="m-page">Friends</span> page. You get there with the <span class="m-btn"><i class="ico" data-icon="people"></i>Friends</span> button on the top bar of the <span class="m-page">My games</span> page (the same button is also on the Question bases, Logos and Poll pages and in the Control panel). On a narrow screen the button may be tucked into the <span class="m-btn">More</span> menu. The number on the button shows invitations waiting for your decision.</p>
<div class="m-note"><p class="m-p">Friends are available only on a registered account. On a guest account the Friends page is not available.</p></div>
<p class="m-p">The page has two parts: <span class="m-btn">Invitations</span> (adding friends and invitations you sent) and <span class="m-btn">Friends</span> (your friends and invitations you received). On a computer both parts are shown side by side; on a phone you switch between them with tabs.</p>

<h3 class="m-h2" id="r10-2">10.2 Sending invitations</h3>
<ol class="m-ol">
<li>Open the <span class="m-page">Friends</span> page and — on a phone — the <span class="m-btn">Invitations</span> tab.</li>
<li>In the <span class="m-strong">Add a friend</span> section, type the email address or username of the person you want to invite into the <span class="m-strong">Email or username</span> field.</li>
<li>Click <span class="m-btn"><i class="ico" data-icon="plus"></i>Invite</span>.</li>
</ol>
<p class="m-p">Once it is saved, you will see the message <span class="m-code">Invitation saved.</span>, and the invitation appears in the <span class="m-strong">Pending and declined</span> section. The invited person sees it on their Friends page, and if they have not turned off email notifications, they also get an email with an <span class="m-strong">Open invitation</span> button.</p>
<p class="m-p">Familiada helps you pick the right way to invite someone:</p>
<ul class="m-ul">
<li>If you enter an email address that has no account, you will see a note that you can add this person as a subscriber, and a <span class="m-btn"><i class="ico" data-icon="arrow-right"></i>Go →</span> button that takes you to the <span class="m-page">Subscribers</span> page (<a class="m-ref" href="#r14-2">chapter 14.2</a>).</li>
<li>It also works the other way round: when you enter the address of a person with an account on the Subscribers page, Familiada suggests inviting them as a friend.</li>
</ul>
<p class="m-p">If the invitation cannot be sent, you will see the reason, for example:</p>
<ul class="m-ul">
<li><span class="m-code">This person is already your friend.</span></li>
<li><span class="m-code">Your invitation to this person is already awaiting a response.</span></li>
<li><span class="m-code">You have a pending request from this person. Check Suggestions.</span> — this person invited you earlier; just accept their invitation.</li>
<li><span class="m-code">This person declined the invitation. You cannot send another one yet.</span> or a note saying from when you can send another invitation.</li>
</ul>

<h3 class="m-h2" id="r10-3">10.3 Handling invitations and their statuses</h3>
<p class="m-p">The action buttons next to invitations and friends are small icons; hover over an icon to see its name.</p>
<h4 class="m-h3" id="r10-3-1">10.3.1 Received invitations</h4>
<p class="m-p">Invitations from other people are in the <span class="m-btn">Friends</span> part, in the <span class="m-strong">Suggestions</span> section. Each has two buttons:</p>
<ul class="m-ul">
<li><span class="m-btn"><i class="ico" data-icon="check"></i>Accept</span> — creates the friendship; the person moves to the <span class="m-strong">Friends</span> section.</li>
<li><span class="m-btn"><i class="ico" data-icon="close"></i>Decline</span> — declines the invitation after you confirm.</li>
</ul>
<p class="m-p">Declined invitations go to the collapsed <span class="m-strong">Declined by me</span> section (it appears only when there is something in it; expand it by clicking its header). For 30 days after declining you can use <span class="m-btn"><i class="ico" data-icon="undo"></i>Undo decline</span> there — the invitation then returns to Suggestions and you can accept it.</p>
<p class="m-p">If you open an invitation from an email, you will see the <span class="m-page">Friend invitation</span> page with an <span class="m-btn">Open Friends</span> button (or <span class="m-btn">Log in</span> if you are not logged in). You always accept the invitation on the Friends page — once you get there, Familiada points it out on the list. If you are logged in to a different account than the one the invitation was sent to, log in to the right account.</p>
<h4 class="m-h3" id="r10-3-2">10.3.2 Sent invitations</h4>
<p class="m-p">Invitations you sent are in the <span class="m-btn">Invitations</span> part, in the <span class="m-strong">Pending and declined</span> section. Each shows a status:</p>
<div class="m-table-wrap"><table class="m-table"><thead><tr><th>Status</th><th>Meaning</th><th>Available actions</th></tr></thead><tbody>
<tr><td>Pending</td><td>The person has not answered yet.</td><td><span class="m-btn"><i class="ico" data-icon="refresh"></i>Resend</span>, <span class="m-btn"><i class="ico" data-icon="trash"></i>Withdraw</span></td></tr>
<tr><td>Declined</td><td>The person declined the invitation. The entry stays visible for a few more days.</td><td><span class="m-btn"><i class="ico" data-icon="trash"></i>Withdraw</span></td></tr>
</tbody></table></div>
<ul class="m-ul">
<li><span class="m-btn"><i class="ico" data-icon="refresh"></i>Resend</span> sends a reminder by email. The button is available only when the recipient accepts email notifications. Reminders have time gaps between them — when you cannot send the next one yet, the button is inactive and shows a countdown.</li>
<li><span class="m-btn"><i class="ico" data-icon="trash"></i>Withdraw</span> — after you confirm (<span class="m-code">Withdraw this invitation?</span>), withdraws the invitation and removes it from the list.</li>
</ul>
<p class="m-p">The numbers on the tabs mean: on <span class="m-btn">Invitations</span> — your invitations waiting for an answer; on <span class="m-btn">Friends</span> — received invitations waiting for your decision.</p>

<h3 class="m-h2" id="r10-4">10.4 Managing your friends list</h3>
<p class="m-p">Active friendships are in the <span class="m-btn">Friends</span> part, in the <span class="m-strong">Friends</span> section. Each person shows their username and email address. You can search the list with the tools in the section header.</p>
<p class="m-p">To remove a person from the list, click <span class="m-btn"><i class="ico" data-icon="trash"></i>Remove</span> next to them and confirm. Removing a friend has these effects:</p>
<ul class="m-ul">
<li>Pending invitations and tasks between you (for example poll invitations) are deleted.</li>
<li>Question bases and devices you shared earlier and that were accepted stay shared — if you want to end that, revoke them separately (bases: <a class="m-ref" href="#r12-5">chapter 12.5</a>).</li>
<li>Copies of games and logos you sent earlier cannot be taken back — they stay with the recipient (<a class="m-ref" href="#r11-1">chapter 11.1</a>).</li>
<li>Removing works like declining an invitation: the person goes to your <span class="m-strong">Declined by me</span> section, where for 30 days you can use <span class="m-btn"><i class="ico" data-icon="undo"></i>Undo decline</span>. During that time the other person cannot send you a new invitation.</li>
</ul>

<h3 class="m-h2" id="r10-5">10.5 What a friendship lets you do</h3>
<p class="m-p">A friendship opens features for working together with other users:</p>
<ul class="m-ul">
<li><span class="m-strong">Sending copies of games and logos</span> — your friend gets their own copy to accept (<a class="m-ref" href="#r11">chapter 11</a>).</li>
<li><span class="m-strong">Sharing question bases</span> — working together on the same base (<a class="m-ref" href="#r12">chapter 12</a>).</li>
<li><span class="m-strong">Inviting to polls</span> — your friend gets a task to cast a vote (<a class="m-ref" href="#r15-2">chapter 15.2</a>).</li>
</ul>

<h2 class="m-ch" id="r11">11. Sending games and logos to friends</h2>

<h3 class="m-h2" id="r11-1">11.1 What sending a copy means</h3>
<p class="m-p">Sending a copy gives your friend an <span class="m-strong">independent copy</span> of a game or logo. The recipient does not get access to your original: changes they make to their copy do not change your game, and your later changes do not reach them.</p>
<div class="m-warn"><p class="m-p">A sent copy cannot be taken back. Once accepted, it belongs to the recipient, even if you later remove them from your friends.</p></div>
<p class="m-p">Sending is different from other ways of moving things around:</p>
<ul class="m-ul">
<li><span class="m-btn"><i class="ico" data-icon="duplicate"></i>Duplicate</span> creates a copy in your own library (<a class="m-ref" href="#r6-6">chapter 6.6</a>).</li>
<li>Export saves a game to a file that you can move on your own (<a class="m-ref" href="#r6-7">chapter 6.7</a>).</li>
<li>Adding a game from Community Games gives you a copy of a publicly published game (<a class="m-ref" href="#r13">chapter 13</a>).</li>
</ul>
<p class="m-p">You can send copies only to friends (<a class="m-ref" href="#r10">chapter 10</a>), and only from a registered account — on a guest account the send button is not available.</p>

<h3 class="m-h2" id="r11-2">11.2 Sending a game</h3>
<ol class="m-ol">
<li>On the <span class="m-page">My games</span> page, select a game tile.</li>
<li>Click <span class="m-btn"><i class="ico" data-icon="envelope-out"></i>Send</span> on the bottom bar of the list (on a phone the button shows only an icon).</li>
<li>In the <span class="m-page">Send to friends</span> window, check the game name under the window title, and in the <span class="m-strong">Choose friends</span> section check one or more people.</li>
<li>Click <span class="m-btn"><i class="ico" data-icon="envelope-out"></i>Send</span>. After sending, you will see a message with the number of friends who received the copy.</li>
</ol>
<p class="m-p">The copy keeps the game type (prepared, standard poll, points) and all its prepared content. If the recipient already has a game with the same name, a number is added to the name of the copy.</p>
<p class="m-p">Not every game can be sent:</p>
<ul class="m-ul">
<li>Prepared games can always be sent.</li>
<li>Poll games can be sent only as a <span class="m-strong">draft</span> — before the poll is started. A game with an open, stopped or closed poll cannot be sent; the message says: <span class="m-code">Only a game draft (without poll results) can be sent.</span> If you want to pass on a game with a poll, you can duplicate it first (a copy of an open or stopped poll starts as a draft — <a class="m-ref" href="#r6-6">chapter 6.6</a>) and send the duplicate.</li>
<li>Games added from Community Games cannot be sent.</li>
</ul>
<p class="m-p">When the <span class="m-btn"><i class="ico" data-icon="envelope-out"></i>Send</span> button is inactive, the selected game does not meet these conditions or no game is selected. Preparing game content is described in <a class="m-ref" href="#r7">chapter 7</a>.</p>
<p class="m-p">Other messages you may see in the send window:</p>
<ul class="m-ul">
<li><span class="m-code">You do not have any active friends yet.</span> — invite someone as a friend first.</li>
<li><span class="m-code">This copy was already sent.</span> — the same game is already waiting for this person's decision.</li>
<li><span class="m-code">You cannot send another copy to this person yet.</span> — the recipient declined a copy of this game earlier; you can send it again 30 days after the decline.</li>
<li><span class="m-code">This person is no longer your friend.</span></li>
</ul>

<h3 class="m-h2" id="r11-3">11.3 Sending a logo</h3>
<p class="m-p">You send a logo the same way as a game:</p>
<ol class="m-ol">
<li>On the <span class="m-page">My logos</span> page, choose the tab with the logo type (<span class="m-btn">Text</span>, <span class="m-btn">Drawing</span> or <span class="m-btn">Image</span>) and select the logo.</li>
<li>Click <span class="m-btn"><i class="ico" data-icon="envelope-out"></i>Send</span>, check friends in the <span class="m-page">Send to friends</span> window and confirm with <span class="m-btn"><i class="ico" data-icon="envelope-out"></i>Send</span>.</li>
</ol>
<p class="m-p">After accepting the copy, the recipient finds the logo in the same tab on their side and can choose it in their own games like any other logo. Creating and using logos is described in <a class="m-ref" href="#r8">chapter 8</a> (choosing a logo for a game: <a class="m-ref" href="#r8-5">chapter 8.5</a>).</p>

<h3 class="m-h2" id="r11-4">11.4 Receiving copies</h3>
<p class="m-p">When a friend sends you a game or logo, the copy waits for your decision:</p>
<ul class="m-ul">
<li>On the <span class="m-page">My games</span> page (for games) or <span class="m-page">My logos</span> (for logos), a <span class="m-strong">Received copies</span> section appears above the list — in the tab matching the type of game or logo. The number on the tab shows how many copies are waiting. On the My games page, the number on the <span class="m-btn"><i class="ico" data-icon="display"></i>Logos</span> button shows pending logo copies.</li>
<li>If you have not turned off email notifications, you will also get an email from the sender with a <span class="m-strong">View copy</span> button.</li>
</ul>
<p class="m-p">In the <span class="m-strong">Received copies</span> section, each copy shows its name, the sender (<span class="m-code">From: …</span>) and these buttons:</p>
<ul class="m-ul">
<li><span class="m-btn"><i class="ico" data-icon="check"></i>Accept</span> — the copy becomes your game or logo, and from now on you can use it fully.</li>
<li><span class="m-btn"><i class="ico" data-icon="close"></i>Decline</span> — the copy is deleted.</li>
</ul>
<p class="m-p">The same buttons are on the page you open from the email (<span class="m-page">You received a copy</span>). After accepting, you will see the message <span class="m-code">The copy was added to your resources.</span> and an <span class="m-btn">Open resource</span> button, which takes you to My games or My logos. If you are not logged in, use the <span class="m-btn">Log in</span> button first.</p>
<div class="m-note"><p class="m-p">You have 5 days to decide. A copy you do not accept in that time expires and disappears.</p></div>
<p class="m-p">An accepted game shows the label <span class="m-code">From: …</span> with the sender's name on its tile, and the <span class="m-strong">Received</span> list filter shows all games received from friends. An accepted logo shows the sender under its name.</p>

<h3 class="m-h2" id="r11-5">11.5 Send history</h3>
<p class="m-p">You can see the send history of a game or logo in the <span class="m-page">Send to friends</span> window:</p>
<ol class="m-ol">
<li>Select the game or logo and click <span class="m-btn"><i class="ico" data-icon="envelope-out"></i>Send</span>.</li>
<li>Click the <span class="m-strong">Send history</span> header below the friends list to expand it.</li>
</ol>
<p class="m-p">The history shows to whom and when (date and time) you sent a copy of this game or logo in the last 30 days — newest first. If you did not send anything in that time, the section does not appear.</p>
<p class="m-p">The history is only for checking what was sent and to whom. It has no action buttons — you cannot take back or delete a sent copy from it.</p>

<h2 class="m-ch" id="r14">14. Subscribers and email notifications</h2>

<h3 class="m-h2" id="r14-1">14.1 Who is a subscriber?</h3>
<p class="m-p">A subscriber is a person <span class="m-strong">without an account</span> in Familiada who agreed to receive poll invitations from you by email. A subscription is different from a friendship:</p>
<ul class="m-ul">
<li>A <span class="m-strong">Friend</span> has an account and can use friend features: receive copies of games and logos, work on shared question bases and vote in polls (<a class="m-ref" href="#r10">chapter 10</a>).</li>
<li>A <span class="m-strong">Subscriber</span> can only receive emails with invitations to your polls and vote through the link in the email.</li>
</ul>
<p class="m-p">You manage your subscribers on the <span class="m-page">Subscribers</span> page, which you open with the <span class="m-btn"><i class="ico" data-icon="envelope"></i>Subscribers</span> button on the top bar of the <span class="m-page">My games</span> page or the Polls page (on a narrow screen it may be in the <span class="m-btn">More</span> menu). The number on the button shows the number of active subscribers. The page is available only on a registered account.</p>
<p class="m-p">Inviting people to a specific vote is described in <a class="m-ref" href="#r15-2">chapter 15.2</a>.</p>

<h3 class="m-h2" id="r14-2">14.2 Inviting subscribers</h3>
<ol class="m-ol">
<li>Open the <span class="m-page">Subscribers</span> page and — on a phone — the <span class="m-btn">Invitations</span> tab.</li>
<li>In the <span class="m-strong">Add a subscriber</span> section, enter the person's address in the <span class="m-strong">Email address</span> field.</li>
<li>Click <span class="m-btn"><i class="ico" data-icon="plus"></i>Invite</span>.</li>
</ol>
<p class="m-p">Only an email address is needed. Once it is saved, you will see the message <span class="m-code">Invitation saved.</span>, and the person receives an email <span class="m-strong">Subscription invitation from …</span> with a <span class="m-strong">View invitation</span> button. After clicking it, they can accept or decline the invitation. They can also do this in the Email center (<a class="m-ref" href="#r14-5">chapter 14.5</a>). Until the recipient accepts the invitation, they do not get poll invitations from you.</p>
<p class="m-p">Special cases:</p>
<ul class="m-ul">
<li>If the address belongs to a person with an account, Familiada tells you that you can invite them as a friend and shows a <span class="m-btn"><i class="ico" data-icon="arrow-right"></i>Go →</span> button to the Friends page (<a class="m-ref" href="#r10-2">chapter 10.2</a>).</li>
<li>If the person is already on the list, you will see the message <span class="m-code">This person is already on the list.</span></li>
<li>If the person declined your invitation earlier or unsubscribed, you can send a new invitation only after 30 days — Familiada shows the date.</li>
<li>You cannot invite an address whose owner has turned off all Familiada notifications.</li>
</ul>

<h3 class="m-h2" id="r14-3">14.3 Subscriber list and status</h3>
<p class="m-p">The <span class="m-page">Subscribers</span> page has two parts (on a phone — two tabs):</p>
<ul class="m-ul">
<li><span class="m-btn">Invitations</span> — the <span class="m-strong">Pending and declined</span> section with sent invitations.</li>
<li><span class="m-btn">Subscribers</span> — the <span class="m-strong">Subscribers</span> section with people who accepted the invitation.</li>
</ul>
<div class="m-table-wrap"><table class="m-table"><thead><tr><th>Where / status</th><th>Meaning</th><th>Available actions</th></tr></thead><tbody>
<tr><td>Pending and declined — <span class="m-strong">Pending</span></td><td>The person has not answered the invitation yet.</td><td><span class="m-btn"><i class="ico" data-icon="refresh"></i>Resend</span>, <span class="m-btn"><i class="ico" data-icon="trash"></i>Remove</span></td></tr>
<tr><td>Pending and declined — <span class="m-strong">Declined</span></td><td>The person declined the invitation. The entry stays visible for a few more days.</td><td><span class="m-btn"><i class="ico" data-icon="trash"></i>Remove</span></td></tr>
<tr><td>Subscribers</td><td>The person accepted the invitation and can receive your polls.</td><td><span class="m-btn"><i class="ico" data-icon="trash"></i>Remove</span></td></tr>
</tbody></table></div>
<ul class="m-ul">
<li><span class="m-btn"><i class="ico" data-icon="refresh"></i>Resend</span> sends a reminder about the invitation. It is available only when the recipient accepts email notifications; when you cannot send the next reminder yet, the button shows a countdown.</li>
<li><span class="m-btn"><i class="ico" data-icon="trash"></i>Remove</span> — after you confirm, removes the subscriber or the invitation. This person's pending tasks from you (poll invitations) are deleted too.</li>
</ul>
<p class="m-p">The numbers on the tabs show the number of pending invitations and the number of active subscribers.</p>
<p class="m-p">If a subscriber later creates a Familiada account with the same address, their entry shows <span class="m-code">Has an account — go to Friends.</span> Such a person no longer gets poll invitations as a subscriber — when they open their Friends page, they will see your friend invitation in the Suggestions section.</p>

<h3 class="m-h2" id="r14-4">14.4 Poll notifications</h3>
<p class="m-p">When you start a poll, you can choose recipients from your friends and subscribers on the Poll page (the <span class="m-btn">Add recipients</span> button). Only subscribers who accepted the subscription invitation appear on the list. Sending invitations and reminders and tracking votes are described in <a class="m-ref" href="#r15-2">chapter 15.2</a> and <a class="m-ref" href="#r15-5">chapter 15.5</a>.</p>
<p class="m-p">A subscriber can receive these emails from you:</p>
<ul class="m-ul">
<li><span class="m-strong">Subscription invitation</span> and possibly a reminder about it.</li>
<li><span class="m-strong">Voting invitation</span> with a <span class="m-strong">Go to voting</span> button.</li>
<li><span class="m-strong">Poll reminder</span>, if you send one with the <span class="m-btn">Remind</span> button.</li>
</ul>
<p class="m-p">In the footer of a poll email, a recipient without an account finds the links <span class="m-strong">Unsubscribe from …</span> (leaving only your subscription) and <span class="m-strong">Unsubscribe from all Familiada emails</span>. Every notification email also contains a <span class="m-strong">My notifications</span> link, which opens the Email center.</p>

<h3 class="m-h2" id="r14-5">14.5 Email center and managing your own subscriptions</h3>
<p class="m-p">The <span class="m-page">Email center</span> (the <span class="m-code">familiada.online/mails/</span> page) is meant for people <span class="m-strong">without an account</span> who receive emails from Familiada — for example subscribers. It lets you see all your subscriptions and invitations and leave selected ones or all of them.</p>
<h4 class="m-h3" id="r14-5-1">14.5.1 How to open the Email center</h4>
<ul class="m-ul">
<li>Click the <span class="m-strong">My notifications</span> link in the footer of any Familiada notification email — the center opens right away.</li>
<li>Or go to <span class="m-code">familiada.online/mails/</span>, enter your address in the <span class="m-strong">Enter your email address</span> field and click <span class="m-btn"><i class="ico" data-icon="envelope-out"></i>Send link</span>. You will get an email with an <span class="m-strong">Open my notifications</span> button; the link is valid for 15 minutes. After opening it, click <span class="m-btn"><i class="ico" data-icon="arrow-right"></i>Open my notifications</span>.</li>
</ul>
<p class="m-p">You can send another link only after a short break — the button then shows a countdown in seconds. If the link has stopped working, you will see the message <span class="m-code">This link no longer works</span> and can ask for a new one.</p>
<div class="m-note"><p class="m-p">If the address belongs to a Familiada account, the center does not open — you will see the message <span class="m-code">You have a Familiada account</span> and a <span class="m-btn"><i class="ico" data-icon="person"></i>Sign in</span> button. People with an account manage notifications in their account settings (<a class="m-ref" href="#r5-8">chapter 5.8</a>) and handle invitations in Familiada itself.</p></div>
<h4 class="m-h3" id="r14-5-2">14.5.2 Subscriptions and tasks</h4>
<p class="m-p">At the top of the <span class="m-page">My notifications</span> page you see your address and the notification status. Below there are two tabs:</p>
<ul class="m-ul">
<li><span class="m-btn">Subscriptions</span> — people you have a subscription with, or an invitation to one. A pending invitation is labeled <span class="m-strong">Awaiting acceptance</span> and has <span class="m-btn"><i class="ico" data-icon="check"></i>Accept</span> and <span class="m-btn"><i class="ico" data-icon="close"></i>Decline</span> buttons. An active subscription has an <span class="m-btn"><i class="ico" data-icon="close"></i>Unsubscribe</span> button.</li>
<li><span class="m-btn">Tasks</span> — open polls you were invited to (labeled <span class="m-strong">Awaiting your vote</span> or <span class="m-strong">Poll opened</span>), with <span class="m-btn"><i class="ico" data-icon="arrow-right"></i>Vote</span> and <span class="m-btn"><i class="ico" data-icon="close"></i>Decline</span> buttons. Devices shared with you also appear in this tab, with a <span class="m-btn"><i class="ico" data-icon="arrow-right"></i>Connect device</span> button. Voting is described in <a class="m-ref" href="#r15-3">chapter 15.3</a>.</li>
</ul>
<p class="m-p">The numbers on the tabs show pending subscription invitations and the number of tasks.</p>
<h4 class="m-h3" id="r14-5-3">14.5.3 Leaving a subscription</h4>
<p class="m-p">To leave one subscription, click <span class="m-btn"><i class="ico" data-icon="close"></i>Unsubscribe</span> next to it (or <span class="m-btn"><i class="ico" data-icon="close"></i>Decline</span> next to an invitation) and confirm. You will no longer get poll invitations from that person, and they can send you a new subscription invitation only after 30 days. Your other subscriptions keep working.</p>
<p class="m-p">You can also leave one person's subscription with the <span class="m-strong">Unsubscribe from …</span> link in the footer of a poll email — a page opens with a button that confirms it.</p>
<h4 class="m-h3" id="r14-5-4">14.5.4 Turning off all notifications</h4>
<p class="m-p">When notifications are on, the top of the page shows <span class="m-strong">Notifications are on</span> and an <span class="m-btn"><i class="ico" data-icon="close"></i>Unsubscribe</span> button. After you click it and confirm:</p>
<ul class="m-ul">
<li>you stop receiving any Familiada notification emails,</li>
<li>all your subscriptions, pending poll invitations and shared devices are cancelled,</li>
<li>the subscription and task lists disappear from the page.</li>
</ul>
<p class="m-p">You can turn notifications back on with the <span class="m-btn"><i class="ico" data-icon="restore"></i>Turn notifications on</span> button.</p>
<div class="m-warn"><p class="m-p">Turning notifications back on does not restore old invitations or subscriptions — to get someone's polls again, that person has to send you a new invitation.</p></div>
<p class="m-p">You can also turn off all notifications with the <span class="m-strong">Unsubscribe from all Familiada emails</span> link in an email footer — a page opens with a <span class="m-btn">Turn off notifications</span> button.</p>
`,
  community: `
<h2 class="m-ch" id="r13">13. Community Games</h2>

<h3 class="m-h2" id="r13-1">13.1 What Community Games are</h3>
<p class="m-p"><span class="m-page">Community Games</span> is a public catalog of ready-made games, prepared by other users or by Familiada. Every game in the catalog has a full set of questions, answers and points, so you can host it right away — without writing your own questions.</p>
<p class="m-p">You get to the catalog from the <span class="m-page">My games</span> page with the <span class="m-btn"><i class="ico" data-icon="gamepad"></i>Community Games</span> button on the top bar. You can also browse the catalog without logging in.</p>
<p class="m-p">Adding a game from the catalog creates <span class="m-strong">your own copy</span> of the game in your library, ready to play. You do not get access to the author's game, and the author does not see your copy or its settings. This is different from a copy sent by a friend, which goes only to chosen people and which you can keep editing — that feature is described in <a class="m-ref" href="#r11-1">chapter 11.1</a>.</p>

<h3 class="m-h2" id="r13-2">13.2 Browsing and searching games</h3>
<p class="m-p">Above the list of games you will find three tools:</p>
<ul class="m-ul">
  <li><span class="m-strong">Search</span> — type part of a title or description in the <span class="m-code">Search games…</span> field. The list refreshes by itself. On a narrow screen, instead of the field you see a <span class="m-btn"><i class="ico" data-icon="search"></i></span> button that opens a search window.</li>
  <li><span class="m-btn"><i class="ico" data-icon="globe"></i>Language</span> — shows games in all languages (<span class="m-code">All</span>) or only in Polish, English or Ukrainian.</li>
  <li><span class="m-btn"><i class="ico" data-icon="sort"></i>Sort</span> — the order of games on the list.</li>
</ul>
<p class="m-p">Available sort options:</p>
<div class="m-table-wrap"><table class="m-table">
  <thead><tr><th>Option</th><th>Order</th></tr></thead>
  <tbody>
    <tr><td><span class="m-code">Recommended</span></td><td>First games in the language you use Familiada in, then the top rated (ratings count for games with at least 3 ratings), the most added and the newest. This is the default.</td></tr>
    <tr><td><span class="m-code">Top rated</span></td><td>By average rating.</td></tr>
    <tr><td><span class="m-code">Most added</span></td><td>By the number of people who added the game to their library.</td></tr>
    <tr><td><span class="m-code">Newest</span></td><td>Most recently added to the catalog first.</td></tr>
    <tr><td><span class="m-code">Title A–Z</span></td><td>Alphabetically by title.</td></tr>
  </tbody>
</table></div>
<p class="m-p">The list shows 20 games at a time. To see more, click <span class="m-btn"><i class="ico" data-icon="arrow-down"></i>Load more</span> below the list.</p>
<p class="m-p">A game card shows:</p>
<ul class="m-ul">
  <li>the game's language, for example <span class="m-code">EN</span>,</li>
  <li>an <span class="m-code">In your games</span> badge if the game is already in your library,</li>
  <li>the title and the author (<span class="m-code">by: username</span>), or a <span class="m-code">Familiada</span> badge for games prepared by Familiada,</li>
  <li>a short description,</li>
  <li>the number of adds, for example <span class="m-code">added 12</span>,</li>
  <li>the average rating in stars with the number of ratings in brackets, or <span class="m-code">No ratings yet</span>.</li>
</ul>

<h3 class="m-h2" id="r13-3">13.3 Game details and ratings</h3>
<p class="m-p">Click a game card to open its details window. It shows the title, language, author, description, ratings and the full list of questions. Each question shows its answers with their points, from the highest scored. This way you can check whether the questions suit you before adding the game.</p>
<p class="m-p">The game's author is shown next to its title. Games prepared by the Familiada team have a <span class="m-code">Familiada</span> badge instead of an author.</p>
<p class="m-p">If you are logged in to an account, you can rate the game: next to <span class="m-strong">Rate this game:</span> click 1 to 5 stars. You can change your rating later by clicking a different number of stars. You cannot rate your own game. In guest mode, ratings are view-only.</p>
<p class="m-p">Game details have their own page address, so you can send it to other people.</p>

<h3 class="m-h2" id="r13-4">13.4 Adding a game to your library and playing it</h3>
<p class="m-p">To add a game to your library:</p>
<ol class="m-ol">
  <li>Open the game details.</li>
  <li>Click <span class="m-btn"><i class="ico" data-icon="plus"></i>Add to my games</span>. The <span class="m-code">In your games</span> badge appears.</li>
</ol>
<p class="m-p">The added game goes to the <span class="m-page">My games</span> page, to the <span class="m-btn">Community Games</span> tab (on a phone: <span class="m-btn">Community</span>). To host it, select its tile and click <span class="m-btn"><i class="ico" data-icon="gamepad"></i>Play</span>. With the <span class="m-btn"><i class="ico" data-icon="settings"></i>Game settings</span> button you can prepare your own gameplay settings for it (<a class="m-ref" href="#r16">chapter 16</a>). The questions and answers of a catalog game cannot be edited.</p>
<p class="m-p">You can remove a game from your library in two ways:</p>
<ul class="m-ul">
  <li>in the <span class="m-btn">Community Games</span> tab on the <span class="m-page">My games</span> page, click the <span class="m-btn"><i class="ico" data-icon="trash"></i></span> icon on the game tile and confirm,</li>
  <li>in the game details window in the catalog, click <span class="m-btn"><i class="ico" data-icon="trash"></i>Remove from my games</span>.</li>
</ul>
<p class="m-p">The game's settings disappear together with it. You can add the game again from the catalog later. Removing your copy does not take the game away from other people who added it and does not change the game in the catalog.</p>
<div class="m-note"><p class="m-p">You cannot remove a game from your library while it is open in another tab — for example in the settings or in the Control panel. Close it there and try again.</p></div>
<p class="m-p">If a game is removed from the catalog completely, your copy stays in your library labeled <span class="m-code">ARCHIVED — removed from Community</span>, and you can still play it.</p>

<h3 class="m-h2" id="r13-5">13.5 Submitting your own game</h3>
<p class="m-p">You can submit your finished game to the catalog so that others can use it. Submitting requires an account — it is not available in guest mode.</p>
<ol class="m-ol">
  <li>On the <span class="m-page">Community Games</span> page, click <span class="m-btn"><i class="ico" data-icon="envelope-out"></i>My submissions</span>. The <span class="m-page">My submitted games</span> window opens.</li>
  <li>Click <span class="m-btn"><i class="ico" data-icon="plus"></i>Submit a new game</span>.</li>
  <li>In the <span class="m-strong">Select game</span> field, pick a game from the list. The list contains only your games that meet the requirements described below.</li>
  <li>Enter the <span class="m-strong">Title</span> the game will have in the catalog (required, up to 120 characters).</li>
  <li>Optionally enter a <span class="m-strong">Description</span> (up to 500 characters) — for example the topic, difficulty and who the game is for.</li>
  <li>In the <span class="m-strong">Game language</span> field, click the flag of the language the questions are in.</li>
  <li>Tick the confirmation <span class="m-code">I understand the snapshot is immutable after submission.</span></li>
  <li>Click <span class="m-btn"><i class="ico" data-icon="envelope-out"></i>Submit to Community Games</span>.</li>
</ol>
<p class="m-p">You can submit a game that:</p>
<ul class="m-ul">
  <li>is a ready prepared game or a closed poll — that is, it meets the readiness conditions for playing (<a class="m-ref" href="#r7-6">chapter 7.6</a>),</li>
  <li>has at least 10 questions,</li>
  <li>does not come from the Community Games catalog and is not a sample game,</li>
  <li>does not already have another submission that is awaiting review or published.</li>
</ul>
<p class="m-p">A closed poll goes into the catalog as a ready game with questions, answers and the points from the vote. Only answers that received points go into the catalog.</p>
<div class="m-warn"><p class="m-p">A submission is a snapshot of the game at the moment you send it. Later editing of your game does not change the version in the catalog, and the submission itself cannot be edited.</p></div>

<h3 class="m-h2" id="r13-6">13.6 Submission status and withdrawing a game</h3>
<p class="m-p">You will find all your submissions in the <span class="m-page">My submitted games</span> window, opened with the <span class="m-btn"><i class="ico" data-icon="envelope-out"></i>My submissions</span> button. Each submission shows its title, language, number of adds, ratings and status:</p>
<div class="m-table-wrap"><table class="m-table">
  <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
  <tbody>
    <tr><td><span class="m-code">Awaiting review</span></td><td>The game is waiting to be checked and is not visible in the catalog yet.</td></tr>
    <tr><td><span class="m-code">Published</span></td><td>The game is visible in the catalog to everyone.</td></tr>
    <tr><td><span class="m-code">Rejected</span></td><td>The game was not accepted. The reason is shown under the status (<span class="m-code">Reason: …</span>).</td></tr>
    <tr><td><span class="m-code">Withdrawn</span></td><td>You withdrew the game from the catalog.</td></tr>
  </tbody>
</table></div>
<p class="m-p">The <span class="m-btn"><i class="ico" data-icon="eye"></i>Preview / Ratings</span> button opens the details of the submitted game — also one that is not published yet. For your own game you will also see the <span class="m-strong">Who rated</span> list with each person's rating.</p>
<p class="m-p">To withdraw a published game:</p>
<ol class="m-ol">
  <li>In the <span class="m-page">My submitted games</span> window, click <span class="m-btn"><i class="ico" data-icon="close"></i>Withdraw</span> next to the game.</li>
  <li>Confirm by clicking <span class="m-btn">Withdraw</span>.</li>
</ol>
<p class="m-p">A withdrawn game disappears from the catalog, and new people can no longer add it. People who added it earlier keep their copies in their libraries. A withdrawn version cannot be published again, but you can submit the same game once more — as a new submission.</p>
`,
  polls: `
<h2 class="m-ch" id="r15">15. Polls and collecting answers</h2>
<p class="m-p">A poll lets you collect real answers from people before you start the game. The voters' answers turn into points — just like in the TV show, where points show how many people surveyed gave a particular answer. The general idea is described in <a class="m-ref" href="#r2">chapter 2</a>; this chapter covers the whole process: from starting the poll, through voting, to counting the results.</p>
<p class="m-p">Sections 15.1, 15.2, 15.5, 15.6 and 15.7 are for the person running the poll. Sections 15.3 and 15.4 describe what a person invited to vote sees.</p>

<h3 class="m-h2" id="r15-1">15.1 Preparing and starting a poll</h3>
<p class="m-p">A poll is not a separate document — it always belongs to a specific game. Only games of the <span class="m-strong">Standard poll</span> and <span class="m-strong">Points</span> types have one. A prepared game has no poll, because you enter the points yourself (see <a class="m-ref" href="#r7-1">chapter 7.1</a>).</p>
<ul class="m-ul">
  <li><span class="m-strong">Standard poll</span> — voters type their own answers to each question. You prepare only the questions.</li>
  <li><span class="m-strong">Points</span> — voters choose one of the answers you prepared. The poll decides how many points each of them gets.</li>
</ul>

<h4 class="m-h3" id="r15-1-1">15.1.1 What you need to prepare</h4>
<p class="m-p">A poll can be started when the game has at least 10 questions. In a “Points” game, each question must also have 3 to 6 answers. In a standard poll you do not enter answers — you collect them from the voters. The full readiness conditions are described in <a class="m-ref" href="#r7-6">chapter 7.6</a>.</p>
<p class="m-p">Check the questions before you start. While the poll is open or stopped, editing the game is locked (see <a class="m-ref" href="#r7-5">chapter 7.5</a>).</p>

<h4 class="m-h3" id="r15-1-2">15.1.2 The poll page</h4>
<p class="m-p">On the <span class="m-page">My games</span> page, select a game and click <span class="m-btn"><i class="ico" data-icon="polls"></i>Poll</span>. If the game does not meet the conditions yet, you will see a message explaining what is missing instead of the poll page.</p>
<p class="m-p">The <span class="m-page">Poll</span> page has two parts:</p>
<ul class="m-ul">
  <li><span class="m-strong">Status bar</span> — on the left, the poll status in one word (<span class="m-code">DRAFT</span>, <span class="m-code">OPEN</span>, <span class="m-code">STOPPED</span> or <span class="m-code">READY</span>) with short info, e.g. the number of votes. On the right are all the buttons you can use in that status. On a phone the buttons show only icons.</li>
  <li><span class="m-strong">Tabs</span> — <span class="m-btn">Sharing</span> (link, QR code and recipients) and <span class="m-btn">Votes</span> (results). On a phone, sharing is split into two tabs: <span class="m-btn">Anonymous</span> and <span class="m-btn">Recipients</span>.</li>
</ul>
<p class="m-p">Under the page name you see the poll type (standard or points) and the game name. When a button cannot be used, the status bar tells you why, e.g. “The game needs at least 10 questions (you have 8).”</p>
<div class="m-note"><p class="m-p">You cannot have the poll page open at the same time as the editor or settings of the same game — Familiada will tell you if the game is already open somewhere else.</p></div>

<h4 class="m-h3" id="r15-1-3">15.1.3 Starting</h4>
<ol class="m-ol">
  <li>Open the poll page. In the <span class="m-code">DRAFT</span> status you can already choose people to invite (see <a class="m-ref" href="#r15-2">chapter 15.2</a>) — they get their invitations when the poll starts.</li>
  <li>Click <span class="m-btn"><i class="ico" data-icon="play"></i>Start</span>. If you have chosen recipients, the button is called <span class="m-btn"><i class="ico" data-icon="play"></i>Start and send invitations (3)</span> — the number in brackets is the number of chosen people.</li>
  <li>Confirm in the <span class="m-page">Start poll?</span> window.</li>
</ol>
<p class="m-p">The poll goes into the <span class="m-code">OPEN</span> status. A voting link and a QR code appear, and the invitations go to the chosen people. Every start creates a new link — links from earlier starts stop working.</p>

<h3 class="m-h2" id="r15-2">15.2 Choosing how people vote</h3>
<p class="m-p">You can collect votes in two ways and combine them in one poll:</p>
<div class="m-table-wrap"><table class="m-table">
  <thead><tr><th>Method</th><th>Who can vote</th><th>What you see about voters</th></tr></thead>
  <tbody>
    <tr><td><span class="m-strong">Anonymous</span> — link or QR code</td><td>Anyone who has the link or scans the code. No account or login needed.</td><td>Only the number of votes and the answers — no information about who voted.</td></tr>
    <tr><td><span class="m-strong">Recipients</span> — invitations</td><td>Chosen friends and subscribers. Each person gets their own invitation and can vote once.</td><td>The list of invited people with each person's status: waiting, voted or declined. The answers themselves are not linked to people.</td></tr>
  </tbody>
</table></div>

<h4 class="m-h3" id="r15-2-1">15.2.1 Link and QR code</h4>
<p class="m-p">The <span class="m-strong">Anonymous</span> section on the <span class="m-btn">Sharing</span> tab shows a QR code and these buttons:</p>
<ul class="m-ul">
  <li><span class="m-btn"><i class="ico" data-icon="copy"></i>Copy link</span> — copies the voting link, which you can send any way you like, e.g. by messenger.</li>
  <li><span class="m-btn"><i class="ico" data-icon="eye"></i>Open</span> — opens the voting page in a new tab so you can see what it looks like.</li>
  <li><span class="m-btn"><i class="ico" data-icon="qr-code"></i>QR on display</span> — shows a code for connecting a big screen with the QR code (described below).</li>
</ul>
<p class="m-p">Click the small QR code to enlarge it in the <span class="m-page">Voting QR code</span> window — handy when several people scan the code from your screen. Before the poll starts, the code's place shows the text “The link will appear after the poll starts”.</p>
<p class="m-p">You can also show the QR code on a big screen, e.g. a TV or projector during a get-together:</p>
<ol class="m-ol">
  <li>Click <span class="m-btn"><i class="ico" data-icon="qr-code"></i>QR on display</span>. The <span class="m-page">QR Display</span> window opens with a 6-digit code. This code is for connecting the screen, not for voting.</li>
  <li>On the device with the big screen, go to <span class="m-code">familiada.online</span>, choose <span class="m-btn"><i class="ico" data-icon="phone"></i>Connect device</span> and enter the code. In the window you can also click <span class="m-btn"><i class="ico" data-icon="eye"></i>Open</span> to open the QR code screen on this computer, or <span class="m-btn"><i class="ico" data-icon="copy"></i>Copy</span> to copy the code.</li>
  <li>A big QR code appears on the screen with the text “Scan the QR code to vote”. The <span class="m-btn"><i class="ico" data-icon="fullscreen-enter"></i></span> button turns on full screen.</li>
</ol>
<p class="m-p">The QR code screen works on a computer, tablet or TV — not on a phone. When you change the language on the poll page, the QR code screen switches to the same language. After the poll ends, the message “The poll has been closed” appears instead of the code. You can read more about connecting devices in <a class="m-ref" href="#r17-1">chapter 17.1</a>.</p>

<h4 class="m-h3" id="r15-2-2">15.2.2 Inviting friends and subscribers</h4>
<p class="m-p">You can invite two groups of people:</p>
<ul class="m-ul">
  <li><span class="m-strong">Friends</span> — people with an account (see <a class="m-ref" href="#r10">chapter 10</a>). The invitation goes to their <span class="m-page">Tasks</span>, and if they have notifications turned on, also to their email.</li>
  <li><span class="m-strong">Subscribers</span> — people who signed up for your polls by email (see <a class="m-ref" href="#r14">chapter 14</a>). They get an email with a “Go to voting” button.</li>
</ul>
<ol class="m-ol">
  <li>In the <span class="m-strong">Recipients</span> section, click <span class="m-btn"><i class="ico" data-icon="people"></i>Add recipients</span>.</li>
  <li>In the <span class="m-page">Add recipients</span> window, check people on the <span class="m-strong">Friends</span> and <span class="m-strong">Subscribers</span> lists. Clicking a row checks the person. Next to each list header there are <span class="m-btn"><i class="ico" data-icon="select-all"></i></span> (select all) and <span class="m-btn"><i class="ico" data-icon="clear-selection"></i></span> (deselect all) buttons.</li>
  <li>Click <span class="m-btn">Send invitations (2)</span>. In the <span class="m-code">DRAFT</span> status the button is called <span class="m-btn">Add selected (2)</span> — the selection then waits for the poll to start.</li>
</ol>
<p class="m-p">The window shows only people who have not been invited to this run of the poll yet. Some people may show a countdown — until it ends, you cannot send that person another invitation. You cannot send new invitations while the poll is stopped; you can do it after resuming voting.</p>
<div class="m-note"><p class="m-p">A recipient can leave the subscription at any time — also without an account, on the <span class="m-page">mails</span> page, where they see all their subscriptions (see <a class="m-ref" href="#r14-5">chapter 14.5</a>). Inviting people is not available on a guest account — you can use the link and QR code instead.</p></div>

<h3 class="m-h2" id="r15-3">15.3 Casting a vote</h3>
<p class="m-p">This section describes voting from the point of view of a person who got the link, scanned the QR code or received an invitation.</p>

<h4 class="m-h3" id="r15-3-1">15.3.1 How voting works</h4>
<p class="m-p">When the poll opens, you see its name, the question text and your progress, e.g. “Question 3/10”. The questions appear one after another.</p>
<ul class="m-ul">
  <li><span class="m-strong">Standard poll</span> — type your answer in the “Enter an answer...” field and click <span class="m-btn"><i class="ico" data-icon="arrow-right"></i>Send</span> (on a phone <span class="m-btn"><i class="ico" data-icon="arrow-right"></i>OK</span>) or press <kbd class="m-kbd">Enter</kbd>. An answer can have at most 17 characters — the counter under the field shows how many you have typed. Characters the Display does not have (e.g. emoji) are skipped when votes are counted. You cannot skip a question without answering.</li>
  <li><span class="m-strong">Points poll</span> — click one of the given answers. The next question appears right away.</li>
</ul>
<p class="m-p">The answers are sent all together, only after the last question. If you close the page earlier, the browser warns you that your answers will not be counted. After sending, you see a thank-you message: “Thanks for participating!”.</p>
<p class="m-p">If the poll is not accepting votes, a message appears instead of the questions, e.g. “The poll is stopped” (voting may be resumed), “The poll has ended” or “This link has expired” (the poll was started again and a new link applies).</p>

<h4 class="m-h3" id="r15-3-2">15.3.2 Anonymous voting</h4>
<p class="m-p">The link or QR code opens the poll straight away — no login and no personal details. The person running the poll does not know who voted. From the same device, another set of answers can be sent only after 30 seconds; the page then shows a countdown: “You can send your answers in … s”.</p>

<h4 class="m-h3" id="r15-3-3">15.3.3 Voting from an invitation</h4>
<p class="m-p">An invitation is personal and lets you vote once. How you get in depends on whether you have an account:</p>
<ul class="m-ul">
  <li><span class="m-strong">You have an account (invitation from a friend)</span> — you open the poll in <span class="m-page">Tasks</span> (see <a class="m-ref" href="#r15-4">chapter 15.4</a>). If you click the button in the email, Familiada asks you to log in (<span class="m-btn">Log in</span>) and then sends you to Tasks with the <span class="m-btn">Open Tasks</span> button. After you vote, you return to Tasks automatically.</li>
  <li><span class="m-strong">You have no account (subscriber)</span> — click “Go to voting” in the email. On the invitation page, choose <span class="m-btn">Vote</span> or <span class="m-btn">Decline</span>. You can also get back to the invitation through the <span class="m-page">mails</span> page (see <a class="m-ref" href="#r15-4-3">chapter 15.4.3</a>).</li>
</ul>
<p class="m-p">When you open an invitation that was already used, you will see “Thank you, your vote has been cast”. An invitation tied to another account requires you to log in to the right account.</p>

<h3 class="m-h2" id="r15-4">15.4 Tasks and voting invitations</h3>
<p class="m-p">A <span class="m-strong">Task</span> is a poll invitation you received from another user. Each task concerns one poll and needs one action from you: voting or declining.</p>

<h4 class="m-h3" id="r15-4-1">15.4.1 The Tasks page</h4>
<p class="m-p">If you have an account, open the <span class="m-page">My games</span> page and click <span class="m-btn"><i class="ico" data-icon="bell"></i>Tasks</span> on the top bar. The number on the button shows how many polls are waiting for your vote.</p>
<p class="m-p">The <span class="m-page">Tasks</span> page has two sections:</p>
<ul class="m-ul">
  <li><span class="m-strong">To do</span> — polls you have not voted in yet. Each shows the poll name, who the invitation is from and when it was received.</li>
  <li><span class="m-strong">Done</span> — polls you have already voted in, with the voting date. The section is collapsed by default — click its header to expand it. Done tasks disappear from the list after 5 days.</li>
</ul>
<p class="m-p">The list refreshes by itself. When you have no invitations, you will see “Nothing to do.”.</p>

<h4 class="m-h3" id="r15-4-2">15.4.2 Voting and declining</h4>
<ul class="m-ul">
  <li><span class="m-btn"><i class="ico" data-icon="polls"></i>Vote</span> — opens the poll. Voting is described in <a class="m-ref" href="#r15-3">chapter 15.3</a>.</li>
  <li><span class="m-btn"><i class="ico" data-icon="cancel"></i>Decline</span> — you choose not to take part. After you confirm in the <span class="m-page">Decline the task?</span> window, the poll disappears from your list, and the person running the poll sees the status “declined” next to you.</li>
</ul>
<p class="m-p">The person running the poll sees that you opened the poll, even if you have not voted yet. If the poll was stopped, ended or started again in the meantime, you will see a matching message when you open the task, e.g. “The poll is stopped” or “This invitation has expired”.</p>

<h4 class="m-h3" id="r15-4-3">15.4.3 Invitations without an account — the mails page</h4>
<p class="m-p">A person without an account has no Tasks page. They find their poll invitations on the <span class="m-page">mails</span> page:</p>
<ol class="m-ol">
  <li>Enter your email address and click <span class="m-btn"><i class="ico" data-icon="envelope-out"></i>Send link</span>.</li>
  <li>Open the link from the email that arrives at that address.</li>
  <li>Go to the <span class="m-btn">Tasks</span> tab. Each poll shows who the invitation is from and its status: “Awaiting your vote” or “Poll opened”.</li>
  <li>Click <span class="m-btn"><i class="ico" data-icon="arrow-right"></i>Vote</span> to open the poll, or <span class="m-btn"><i class="ico" data-icon="close"></i>Decline</span> to opt out.</li>
</ol>
<p class="m-p">On the same page, in the <span class="m-btn">Subscriptions</span> tab, you can manage your subscriptions (see <a class="m-ref" href="#r14-5">chapter 14.5</a>). If the address belongs to an account, the page asks you to log in — you will then find your invitations in Tasks.</p>

<h3 class="m-h2" id="r15-5">15.5 Running the vote</h3>
<p class="m-p">While the poll is open, the page refreshes itself every few seconds. You do not need to reload it to see new votes.</p>

<h4 class="m-h3" id="r15-5-1">15.5.1 Checking progress</h4>
<ul class="m-ul">
  <li><span class="m-strong">Status bar</span> — in the <span class="m-code">OPEN</span> status it shows the number of people who voted, e.g. “12 votes”. If you invited recipients, there is a summary next to it: “Invited 5 · Voted 3 · Declined 1”.</li>
  <li><span class="m-strong">Votes tab</span> — live results for each question. In a points poll you see the number of votes for each answer and a bar showing its share. In a standard poll you see the most frequently typed answers with their number of votes; new answers are added at the end of the list.</li>
  <li><span class="m-strong">Recipient list</span> — in the <span class="m-strong">Recipients</span> section each invited person is marked as a friend or a subscriber, together with their status.</li>
</ul>
<div class="m-table-wrap"><table class="m-table">
  <thead><tr><th>Recipient status</th><th>Meaning</th></tr></thead>
  <tbody>
    <tr><td><span class="m-code">waiting</span></td><td>The invitation was sent and the person has not voted yet. The note “Opened” means they have already opened the poll.</td></tr>
    <tr><td><span class="m-code">voted</span></td><td>The person has cast their vote.</td></tr>
    <tr><td><span class="m-code">declined</span></td><td>The person chose not to take part.</td></tr>
  </tbody>
</table></div>

<h4 class="m-h3" id="r15-5-2">15.5.2 Reminders and removing invitations</h4>
<ul class="m-ul">
  <li><span class="m-btn"><i class="ico" data-icon="refresh"></i></span> <span class="m-strong">Remind</span> — sends the email again to a person who has not voted yet. You can send each person at most two reminders. After sending, the button shows a countdown until you can send the next one. Reminders are available only while the poll is open and only when the recipient has email notifications turned on.</li>
  <li><span class="m-btn"><i class="ico" data-icon="trash"></i></span> <span class="m-strong">Remove sharing</span> — removes the invitation; the email link stops working. If the person has already voted, their vote is removed together with the invitation.</li>
</ul>
<p class="m-p">Managing the subscriber list itself is described in <a class="m-ref" href="#r14-3">chapter 14.3</a>.</p>

<h4 class="m-h3" id="r15-5-3">15.5.3 Stopping and resuming</h4>
<p class="m-p">Click <span class="m-btn"><i class="ico" data-icon="stop"></i>Stop</span> when you want to stop collecting votes. The poll goes into the <span class="m-code">STOPPED</span> status:</p>
<ul class="m-ul">
  <li>collected votes stay,</li>
  <li>the link still works, but voters see the message “The poll is stopped”,</li>
  <li>you cannot send new invitations or reminders,</li>
  <li>the <span class="m-btn">Votes</span> tab shows the collected votes.</li>
</ul>
<p class="m-p">From a stopped poll you have two options: <span class="m-btn"><i class="ico" data-icon="play"></i>Resume voting</span> — the poll accepts votes again under the same link, and the collected votes stay; or <span class="m-btn"><i class="ico" data-icon="polls"></i>Count votes</span> — go to counting (see <a class="m-ref" href="#r15-6">chapter 15.6</a>).</p>

<h4 class="m-h3" id="r15-5-4">15.5.4 Aborting a poll</h4>
<p class="m-p">The <span class="m-btn"><i class="ico" data-icon="cancel"></i>Abort</span> button is available for an open or stopped poll. Use it when you want to fix the questions or start collecting from scratch.</p>
<div class="m-warn"><p class="m-p">Aborting deletes all collected votes, and links and invitations expire. The poll goes back to the <span class="m-code">DRAFT</span> status and you can edit the game again. This cannot be undone.</p></div>

<h3 class="m-h2" id="r15-6">15.6 Counting and working on the answers</h3>
<p class="m-p">Counting turns votes into points. It happens on the <span class="m-btn">Votes</span> tab, on the same rows you saw during voting.</p>

<h4 class="m-h3" id="r15-6-1">15.6.1 How Familiada calculates points</h4>
<p class="m-p">Familiada does not require exactly 100 voters — there can be fewer or more, even several hundred. The results are converted to a 0–100 scale by these rules, in this order:</p>
<ol class="m-ol">
  <li><span class="m-strong">Complete polls</span> — only the votes of people who answered all the questions count. Their number is the basis of all calculations (it is shown as “Complete polls: 40”).</li>
  <li><span class="m-strong">Merging</span> (standard poll only) — characters the Display does not have are removed from the answers, and answers that differ only in upper or lower case count together. Your own corrections, described in <a class="m-ref" href="#r15-6-3">chapter 15.6.3</a>, are added on top.</li>
  <li><span class="m-strong">Rounding</span> — an answer's share is the percentage of complete polls rounded down to a whole number. An answer with at least one vote but less than 1% gets 1%.</li>
  <li><span class="m-strong">Qualifying</span> — an answer qualifies if its rounded share is at least 4%. An answer's points equal its share, so the same number of votes gives the same points.</li>
  <li><span class="m-strong">List limit</span> (standard poll only) — at most 6 qualifying answers go into the game, the most frequent first. That is how many rows fit on the Display board — this is a screen limit, not a rule of the TV show.</li>
</ol>
<p class="m-p">Example: 50 people completed the whole poll. An answer given by 9 people has 18% and gets 18 pts. An answer given by 1 person has 2% — it does not qualify and is skipped.</p>

<h4 class="m-h3" id="r15-6-2">15.6.2 Entering counting</h4>
<p class="m-p">Counting and closing the poll are two separate steps. First you enter counting and look at the result; you close the poll only with the <span class="m-btn"><i class="ico" data-icon="check"></i>Approve</span> button.</p>
<ol class="m-ol">
  <li>Stop the poll (see <a class="m-ref" href="#r15-5-3">chapter 15.5.3</a>).</li>
  <li>Click <span class="m-btn"><i class="ico" data-icon="polls"></i>Count votes</span>. The button works from 10 complete polls — before that, the status bar shows e.g. “Votes can be counted from 10 complete polls (now: 7).”</li>
</ol>
<p class="m-p">You can enter counting even when the results do not meet the closing conditions yet — you will then see what is missing. The <span class="m-btn"><i class="ico" data-icon="arrow-left"></i>Leave counting</span> button takes you back to the view of collected votes; you can then resume voting and collect more answers.</p>
<p class="m-p">Each question shows the number of complete polls and the points total. Each answer shows its number of votes, percentage share and points. Answers below 4% are grayed out and show “— pts”.</p>

<h4 class="m-h3" id="r15-6-3">15.6.3 Working on text answers</h4>
<p class="m-p">In a points poll the answers are fixed, so counting only shows the points. In a standard poll voters type answers in different ways, e.g. “CAT”, “kitty”, “cats”. Before approving, merge such answers so that their votes count together:</p>
<ul class="m-ul">
  <li><span class="m-strong">Merging by dragging</span> (computer) — grab an answer by its <span class="m-btn"><i class="ico" data-icon="grip"></i></span> handle and drop it onto another answer to the same question. The votes go to the answer you drop it on.</li>
  <li><span class="m-strong">Merging with a button</span> (phone and tablet) — tap <span class="m-btn"><i class="ico" data-icon="merge"></i></span> <span class="m-strong">Merge with…</span> next to the first answer, then the same button next to the target answer.</li>
  <li><span class="m-btn"><i class="ico" data-icon="merge"></i>Merge duplicates</span> — merges in one click all answers to a question that read the same after cleaning.</li>
  <li><span class="m-strong">Fixing text</span> — click the answer text and correct it, e.g. a typo. The text can have at most 17 characters. If two answers read the same after the fix, their votes count together.</li>
  <li><span class="m-btn"><i class="ico" data-icon="trash"></i></span> <span class="m-strong">Remove</span> — removes the answer from counting, e.g. a joke or an off-topic answer.</li>
</ul>
<p class="m-p">After every change the points are recalculated right away, and the rows are sorted from the most frequent. Merging can therefore change the order of answers, bring a new answer into the top six or push another one out of it. Answers outside the top six are grayed out.</p>
<p class="m-p">Each question has an “Answers: 4 (3–6 required)” counter showing how many answers will go into the game. When there are fewer than 3, the counter is highlighted and approving is not possible.</p>
<p class="m-p"><span class="m-strong">A tie at the top-six boundary</span> — if several answers have the same number of votes and there are fewer places left in the top six, Familiada shows which answers went into the game and which were skipped. The <span class="m-btn"><i class="ico" data-icon="tie-switch"></i>Change tie choice</span> button switches this choice through the other possible sets, one by one.</p>
<p class="m-p">You can undo changes with the <span class="m-btn"><i class="ico" data-icon="undo"></i></span> (Undo) and <span class="m-btn"><i class="ico" data-icon="redo"></i></span> (Redo) buttons or with the shortcuts <kbd class="m-kbd">Ctrl</kbd>+<kbd class="m-kbd">Z</kbd> and <kbd class="m-kbd">Ctrl</kbd>+<kbd class="m-kbd">Y</kbd> (or <kbd class="m-kbd">Ctrl</kbd>+<kbd class="m-kbd">Shift</kbd>+<kbd class="m-kbd">Z</kbd>).</p>
<div class="m-note"><p class="m-p">Your corrections are saved automatically. When you leave counting and enter it again, you will see the message “Saved changes restored.”. However, if you resume voting in the meantime and new votes come in, the saved corrections are not restored — you start working on the answers again, so that no new answers are missed.</p></div>

<h4 class="m-h3" id="r15-6-4">15.6.4 Approving and closing the poll</h4>
<p class="m-p">To close the poll, every question must have at least 3 qualifying answers, that is answers with at least 4% of complete polls. The final list can have fewer than 6 answers — what matters is that there are at least 3.</p>
<ol class="m-ol">
  <li>Click <span class="m-btn"><i class="ico" data-icon="check"></i>Approve</span>.</li>
  <li>Confirm in the summary window.</li>
</ol>
<p class="m-p">If a question does not meet the condition, Familiada points it out, e.g. “Question #4: to approve, at least 3 answers need ≥ 4% of complete polls.”. You can then leave counting, resume voting and collect more votes, and in a standard poll you can also merge similar answers.</p>
<p class="m-p">After approval, the poll goes into the <span class="m-code">READY</span> status with the note “ready to play”. Links and invitations expire.</p>
<ul class="m-ul">
  <li><span class="m-strong">Standard poll</span> — the chosen answers (3 to 6) with their points become the question's answers in the game.</li>
  <li><span class="m-strong">Points poll</span> — each answer gets points equal to its share. An answer below 4% stays with the question with 0 pts.</li>
</ul>

<h3 class="m-h2" id="r15-7">15.7 Results and using them in the game</h3>
<p class="m-p">When the poll is in the <span class="m-code">READY</span> status, the <span class="m-btn">Votes</span> tab shows the final result: for each question, the answers sorted by points. Answers with 0 pts are grayed out. The <span class="m-btn">Sharing</span> tab is then unavailable — sharing expired when the poll ended. You can also view the result in the game preview on the <span class="m-page">My games</span> page (see <a class="m-ref" href="#r6-4">chapter 6.4</a>).</p>
<p class="m-p">A game with a poll can be played only after the results are approved. Before that, Familiada tells you: “The game will be playable once the poll is closed.”. An approved poll meets the scoring conditions described in <a class="m-ref" href="#r7-6">chapter 7.6</a>, so you can prepare the gameplay settings right away (<a class="m-ref" href="#r16">chapter 16</a>) and host the game (<a class="m-ref" href="#r17">chapter 17</a>).</p>
<p class="m-p">If you want to collect votes once more, click <span class="m-btn"><i class="ico" data-icon="refresh"></i>Restart</span>. The poll starts again with a new link, and recipients have to be invited again.</p>
<div class="m-warn"><p class="m-p">Restarting deletes the existing votes and results. Changes to the game content after the poll is closed may also require collecting votes again — see <a class="m-ref" href="#r7-5">chapter 7.5</a>.</p></div>
`,
  settings: `
<h2 class="m-ch" id="r16">16. Game settings</h2>
<p class="m-p">On the <span class="m-page">Game settings</span> page you prepare a game calmly, before you go to the <span class="m-page">Control panel</span>: team names, board appearance, sounds, question selection and scoring options. The rules of the rounds and the finale are described in <a class="m-ref" href="#r3">chapter 3</a> and <a class="m-ref" href="#r4">chapter 4</a> — here you will only find how to adjust them.</p>

<h3 class="m-h2" id="r16-1">16.1 Preparing the settings</h3>
<p class="m-p">Settings apply to <span class="m-strong">one specific game</span> — each game has its own. The <span class="m-page">Control panel</span> loads the saved settings automatically every time you start that game.</p>
<p class="m-p">You can open the settings page in two ways:</p>
<ul class="m-ul">
<li>on the <span class="m-page">My games</span> page, select a game and click <span class="m-btn"><i class="ico" data-icon="settings"></i>Game settings</span> (the game list is described in <a class="m-ref" href="#r6-4">chapter 6.4</a>);</li>
<li>in the <span class="m-page">Control panel</span>, on the <span class="m-page">Summary</span> screen before the game starts, click <span class="m-btn"><i class="ico" data-icon="settings"></i>Change settings</span> (shortcut <kbd class="m-kbd">E</kbd>). When you come back with the <span class="m-btn"><i class="ico" data-icon="arrow-left"></i>Back</span> button, the Control panel loads the settings again.</li>
</ul>
<p class="m-p">The page works on a computer and a tablet. You can open the settings only for a game that is ready to play — the game must meet the readiness requirements from <a class="m-ref" href="#r7-6">chapter 7.6</a>.</p>
<p class="m-p">On the left there is a list of sections: <span class="m-btn">Teams</span>, <span class="m-btn">Display</span>, <span class="m-btn">Sound</span>, <span class="m-btn">Questions — Settings</span>, <span class="m-btn">Questions — Finale</span>, <span class="m-btn">Questions — Rounds</span> and <span class="m-btn">Game settings</span>. On a narrower screen, the section list is shown by the <span class="m-btn"><i class="ico" data-icon="hamburger"></i></span> button on the bar above the content. The same bar has the <span class="m-btn"><i class="ico" data-icon="refresh"></i>Restore defaults</span>, <span class="m-btn"><i class="ico" data-icon="save"></i>Save</span> and <span class="m-btn"><i class="ico" data-icon="gamepad"></i>Play</span> buttons (described in <a class="m-ref" href="#r16-7">chapter 16.7</a>).</p>
<div class="m-note"><p class="m-p">The settings of one game cannot be changed in several places at once. If this game is open somewhere else (in the editor, in a poll, in the Control panel or in a second settings tab), the page shows the message <span class="m-strong">This game is open elsewhere.</span> You also cannot open the settings while a logo is being edited — close the logo editor first.</p></div>
<div class="m-warn"><p class="m-p">If a game session of this game is still in progress, you will see the <span class="m-strong">Game in progress</span> window. Saved changes will only apply to the next game. You can click <span class="m-btn">Go back</span> and wait until the game lock expires (the window shows the remaining time), or click <span class="m-btn">End game and open settings</span> — the current game and the device connections will then be interrupted.</p></div>

<h3 class="m-h2" id="r16-2">16.2 Teams</h3>
<p class="m-p">In the <span class="m-btn">Teams</span> section, enter the names in the <span class="m-strong">Team A name</span> and <span class="m-strong">Team B name</span> fields. If you leave a field empty, the game uses the default names: <span class="m-code">Team A</span> and <span class="m-code">Team B</span>.</p>
<p class="m-p">Team names appear:</p>
<ul class="m-ul">
<li>on the <span class="m-page">Display</span>, in the long fields of the board — team A's name on the left, team B's on the right;</li>
<li>on the <span class="m-page">Summary</span> screen in the Control panel, as <span class="m-code">Team A vs Team B</span>;</li>
<li>in the Display preview in the <span class="m-btn">Display</span> section — right away, even before saving.</li>
</ul>
<p class="m-p">The name must fit on the Display, so the field will not accept longer text — you will then see the message <span class="m-strong">A longer name will not fit on the Display.</span> What counts is the actual width of the letters, not their number, so more narrow characters will fit. The field will not accept characters the Display cannot show, and the message will list them by name.</p>

<h3 class="m-h2" id="r16-3">16.3 Display</h3>
<p class="m-p">In the <span class="m-btn">Display</span> section you set the colors, theme and logo. Below the settings you see two previews: <span class="m-strong">Display preview</span> and <span class="m-strong">Host preview</span>. They show your current choices, including unsaved ones, together with the team names and sample numbers on the board.</p>
<h4 class="m-h3" id="r16-3-kolory">Colors</h4>
<p class="m-p">You can change four colors:</p>
<div class="m-table-wrap"><table class="m-table">
<thead><tr><th>Field</th><th>What it changes</th><th>Default</th></tr></thead>
<tbody>
<tr><td><span class="m-strong">Team A color</span></td><td>board elements related to team A</td><td><span class="m-code">#C4002F</span></td></tr>
<tr><td><span class="m-strong">Team B color</span></td><td>board elements related to team B</td><td><span class="m-code">#2A62FF</span></td></tr>
<tr><td><span class="m-strong">Background</span></td><td>the Display background</td><td><span class="m-code">#D21180</span></td></tr>
<tr><td><span class="m-strong">Dot color</span></td><td>the glowing dots of the board; also the logo color on the host screen</td><td><span class="m-code">#D7FF3D</span></td></tr>
</tbody></table></div>
<p class="m-p">Click a color swatch to open the color picker. You can set the color in two ways:</p>
<ul class="m-ul">
<li>enter a code in the <span class="m-strong">HEX</span> field in the <span class="m-code">#RRGGBB</span> format, e.g. <span class="m-code">#FFCC00</span>;</li>
<li>move the <span class="m-strong">R</span>, <span class="m-strong">G</span> and <span class="m-strong">B</span> sliders (red, green, blue, each from 0 to 255). The bar of each slider shows how the color will change.</li>
</ul>
<p class="m-p">The box next to the code shows the selected color. Click <span class="m-btn">Save</span> in the window to accept the color, or <span class="m-btn">Cancel</span> to keep the previous one. The accepted color is visible in the preview right away — it reaches the game once you save the settings.</p>
<h4 class="m-h3" id="r16-3-motyw">Theme</h4>
<p class="m-p">From the <span class="m-strong">Theme</span> list, choose the graphic style of the board: <span class="m-strong">Classic</span> (default) or <span class="m-strong">Modern</span>. The theme changes the look of the Display and the host screen.</p>
<h4 class="m-h3" id="r16-3-logo">Logo</h4>
<p class="m-p">In the <span class="m-strong">Logo</span> part you see tiles: <span class="m-strong">Default</span> (the Familiada logo) and all your logos, starting with the most recently changed. Click a tile to choose the logo for this game. The Display shows the selected logo at the start of the game, and at the end — if you choose <span class="m-strong">Logo</span> as the end screen (<a class="m-ref" href="#r16-6">chapter 16.6</a>). How to create your own logo is described in <a class="m-ref" href="#r8">chapter 8</a>.</p>
<h4 class="m-h3" id="r16-3-logo-prowadzacego">Host logo: Pixels and Source</h4>
<p class="m-p">The host sees the game logo on the cover of their screen. The <span class="m-strong">Host logo</span> switch decides in what form they will see it:</p>
<ul class="m-ul">
<li><span class="m-btn">Pixels</span> — the host screen shows the logo in the same pixel form as the Display. There is only one difference: instead of round dots with gaps, it draws squares that touch each other.</li>
<li><span class="m-btn">Source</span> (default) — the host screen shows the material the logo was made from, in better quality than the dot grid:
<ul class="m-ul">
<li><span class="m-strong">image logo</span> — the image in its original form, with the chosen crop and rotation; a solid background around the image is removed;</li>
<li><span class="m-strong">drawn logo</span> — the drawing recreated as smooth vector graphics in the assigned color: light parts of the drawing take the color, and dark parts are transparent;</li>
<li><span class="m-strong">text logo</span> — the entered text laid out as a distinctive, curved, three-dimensional caption in the Familiada style. The <span class="m-strong">Default</span> logo looks the same way — as the caption <span class="m-code">FAMILIADA</span>.</li>
</ul></li>
</ul>
<p class="m-p">The color of the host logo in both modes (except for an image logo, which keeps its own colors) comes from the <span class="m-strong">Dot color</span> setting. As long as this color has its default value, the logo is gold.</p>
<div class="m-note"><p class="m-p">This choice applies <span class="m-strong">only</span> to the host screen. The Display is a dot screen, so it always shows the pixel logo. You can check how both modes look in the <span class="m-strong">Host preview</span>; the selected mode is also shown in the Control panel Summary.</p></div>
<p class="m-p">The <span class="m-btn"><i class="ico" data-icon="refresh"></i>Restore defaults</span> button at the bottom of the section restores the default colors, theme, logo and host logo mode. It does not change the other sections.</p>

<h3 class="m-h2" id="r16-4">16.4 Sound</h3>
<p class="m-p">In the <span class="m-btn">Sound</span> section, each game sound has its own row: <span class="m-strong">Show outro music</span>, <span class="m-strong">Show intro music</span>, <span class="m-strong">Round transition</span>, <span class="m-strong">Final theme music</span>, <span class="m-strong">Buzzer press</span>, <span class="m-strong">Correct answer</span>, <span class="m-strong">Wrong answer (X)</span>, <span class="m-strong">Repeat answer (final)</span>, <span class="m-strong">Time's up (final)</span> and <span class="m-strong">Reveals and board transitions</span>.</p>
<p class="m-p">In each row you can:</p>
<ul class="m-ul">
<li><span class="m-strong">choose a variant</span> from the list — the ready-made <span class="m-strong">Classic</span> variant (default) or <span class="m-strong">Custom</span>, which is your own sound file;</li>
<li><span class="m-strong">listen to the sound</span> with the <span class="m-btn"><i class="ico" data-icon="play"></i></span> button. While the sound plays, it changes to <span class="m-btn"><i class="ico" data-icon="stop"></i></span>, which stops the sound;</li>
<li><span class="m-strong">set the volume</span> with a slider from 0 to 100% (default 100%). The change works right away, also on a preview that is currently playing.</li>
</ul>
<h4 class="m-h3" id="r16-4-wlasny">Your own sound file</h4>
<ol class="m-ol">
<li>In the sound's row, choose the <span class="m-strong">Custom</span> variant.</li>
<li>Click <span class="m-btn"><i class="ico" data-icon="upload"></i>Choose file</span> and select an MP3, WAV or OGG file.</li>
<li>The file name appears in the row — you can listen to it right away.</li>
<li>Click <span class="m-btn"><i class="ico" data-icon="save"></i>Save</span>. Only then is the file saved together with the game, and it will be available on every device where you start this game.</li>
</ol>
<p class="m-p">The file cannot be longer than the limit for the given sound:</p>
<div class="m-table-wrap"><table class="m-table">
<thead><tr><th>Sounds</th><th>Maximum length</th></tr></thead>
<tbody>
<tr><td>Buzzer press, Correct answer, Wrong answer (X), Repeat answer (final), Time's up (final), Reveals and board transitions</td><td>5 seconds</td></tr>
<tr><td>Show intro music, Round transition, Final theme music</td><td>30 seconds</td></tr>
<tr><td>Show outro music</td><td>2 minutes</td></tr>
</tbody></table></div>
<p class="m-p">To remove your own file, click <span class="m-btn"><i class="ico" data-icon="trash"></i></span> next to its name. The file is removed immediately. Then upload another file or choose a ready-made variant from the list — settings with the <span class="m-strong">Custom</span> variant and no file cannot be saved.</p>
<div class="m-warn"><p class="m-p">The <span class="m-btn"><i class="ico" data-icon="refresh"></i>Restore defaults</span> button at the bottom of the Sound section sets all sounds to the default variant and the volume to 100%, and <span class="m-strong">immediately deletes all custom sound files of this game</span>. This cannot be undone — you will have to upload the files again.</p></div>

<h3 class="m-h2" id="r16-5">16.5 Questions</h3>
<p class="m-p">Three question sections decide whether the game has a finale, which questions go to the finale and in what order questions appear in the rounds. A question used in the finale never goes to the rounds of the same game. You will see the result of the question selection before the game starts, on the <span class="m-page">Summary</span> screen in the Control panel (<a class="m-ref" href="#r17-2">chapter 17.2</a>).</p>

<h4 class="m-h3" id="r16-5-1">16.5.1 Question settings</h4>
<p class="m-p">The <span class="m-btn">Questions — Settings</span> section has two parts.</p>
<p class="m-p"><span class="m-strong">Finale.</span> The <span class="m-strong">Does the game include a finale?</span> switch has two positions: <span class="m-btn">Yes</span> and <span class="m-btn">No</span> (default <span class="m-strong">Yes</span>). Without a finale, the game ends after the rounds. When you choose <span class="m-strong">Yes</span>, the <span class="m-strong">Finale questions mode</span> appears:</p>
<ul class="m-ul">
<li><span class="m-btn">Random</span> (default) — before the game starts, the system draws 5 questions from the questions meant for the rounds and removes them from the rounds;</li>
<li><span class="m-btn">Manual</span> — you choose exactly 5 questions yourself in the <span class="m-btn">Questions — Finale</span> section (<a class="m-ref" href="#r16-5-2">chapter 16.5.2</a>).</li>
</ul>
<p class="m-p">When you turn the finale off, the questions previously chosen for the finale return to the end of the round question list.</p>
<p class="m-p"><span class="m-strong">Rounds.</span> The <span class="m-strong">Rounds question order mode</span> has two positions:</p>
<ul class="m-ul">
<li><span class="m-btn">Random</span> (default) — the system shuffles the questions available for the rounds, and the rounds use them one by one;</li>
<li><span class="m-btn">Order</span> — the rounds use the questions in the order set in the <span class="m-btn">Questions — Rounds</span> section (<a class="m-ref" href="#r16-5-3">chapter 16.5.3</a>).</li>
</ul>
<p class="m-p">The <span class="m-btn">Questions — Finale</span> and <span class="m-btn">Questions — Rounds</span> sections are inactive (greyed out) until you choose, respectively, the finale in <span class="m-strong">Manual</span> mode and the rounds in <span class="m-strong">Order</span> mode.</p>
<div class="m-note"><p class="m-p">With a random finale and a fixed round order, a warning appears below the switch: drawing the finale will take 5 questions from your round list. If you draw the finale again in the Summary, the previous finale questions return to the end of the round list.</p></div>

<h4 class="m-h3" id="r16-5-2">16.5.2 Finale questions</h4>
<p class="m-p"><span class="m-strong">Manual selection.</span> In the <span class="m-btn">Questions — Finale</span> section you see two lists: the round questions (the pool) on the left and the finale questions on the right. The <span class="m-strong">Final: 0/5</span> counter shows how many questions have already been chosen.</p>
<ul class="m-ul">
<li>Click a question in the pool or drag it to the right list to add it to the finale. Once 5 questions are chosen, you cannot add more.</li>
<li>Click a question on the finale list or drag it back to the pool to remove it. It then returns to the round questions.</li>
<li>Drag questions within the finale list to set their order.</li>
</ul>
<p class="m-p">With the finale on in <span class="m-strong">Manual</span> mode, the settings can only be saved with exactly 5 finale questions — otherwise you will see a message with the number of selected questions, and the page will take you to this section.</p>
<p class="m-p"><span class="m-strong">Random selection.</span> In <span class="m-strong">Random</span> mode you do not choose anything in the settings. The draw happens when you go to the <span class="m-page">Summary</span> screen in the Control panel. You will see the drawn set there, and you can change it with the <span class="m-btn">Reshuffle</span> button next to the finale questions — until the game starts. A full finale needs at least 5 questions in the round pool. With manual selection there is no redraw button — the Summary then shows your 5 questions.</p>

<h4 class="m-h3" id="r16-5-3">16.5.3 Round questions</h4>
<p class="m-p"><span class="m-strong">Fixed order.</span> In the <span class="m-btn">Questions — Rounds</span> section you see a numbered list of round questions (without the questions chosen for the finale). Change the order by dragging a question by its handle <span class="m-btn"><i class="ico" data-icon="grip"></i></span> or by clicking the arrows <span class="m-btn"><i class="ico" data-icon="arrow-up"></i></span> (<span class="m-strong">Move up</span>) and <span class="m-btn"><i class="ico" data-icon="arrow-down"></i></span> (<span class="m-strong">Move down</span>). The first round uses question no. 1, the second — no. 2, and so on. Once all questions on the list are used, no more are added.</p>
<p class="m-p"><span class="m-strong">Random selection.</span> In <span class="m-strong">Random</span> mode the questions are shuffled when you go to the <span class="m-page">Summary</span> screen in the Control panel. You will see the prepared order there, and you can shuffle them again with the <span class="m-btn">Reshuffle</span> button next to the round questions — until the game starts.</p>

<h3 class="m-h2" id="r16-6">16.6 Additional settings</h3>
<p class="m-p">The <span class="m-btn">Game settings</span> section contains thresholds, multipliers and prizes. The default values match the classic Familiada, so you usually don't need to change them. These options do not change the rules — only the numbers they depend on (rules: <a class="m-ref" href="#r3">chapter 3</a> and <a class="m-ref" href="#r4">chapter 4</a>).</p>
<div class="m-table-wrap"><table class="m-table">
<thead><tr><th>Setting</th><th>Default</th><th>What it changes in practice</th></tr></thead>
<tbody>
<tr><td><span class="m-strong">Round multipliers</span> (<span class="m-strong">Round scoring</span> part)</td><td><span class="m-code">1, 1, 1, 2, 3</span></td><td>Points won in a round are multiplied by that round's multiplier: the first number applies to round 1, the second — to round 2, and so on. The last number applies to all further rounds.</td></tr>
<tr><td><span class="m-strong">Points threshold for finale</span></td><td><span class="m-code">300</span></td><td>When one of the teams reaches this many points, the rounds end: the game goes to the finale, or — without a finale — to the end. If the questions run out earlier, the game ends without a finale.</td></tr>
<tr><td><span class="m-strong">Finale target (pts)</span> — only with a finale</td><td><span class="m-code">200</span></td><td>The total points of both players in the finale that means winning the main prize.</td></tr>
<tr><td><span class="m-strong">End screen mode</span> (<span class="m-strong">End screen</span> part)</td><td><span class="m-strong">Logo</span></td><td>What the Display shows at the end of the game — see below.</td></tr>
<tr><td><span class="m-strong">Main prize amount</span> — only with a finale and the Prize amount mode</td><td><span class="m-code">25000</span></td><td>The amount added to the prize when the target is reached in the finale. From 1 to 99999.</td></tr>
<tr><td><span class="m-strong">Prize multiplier (after finale)</span> — only with a finale and the Prize amount mode</td><td><span class="m-code">3</span></td><td>The winning team's points are multiplied by this number when calculating the prize.</td></tr>
</tbody></table></div>
<p class="m-p">Enter multipliers as positive whole numbers separated by commas, e.g. <span class="m-code">1,1,1,2,3</span>. Fractions (e.g. <span class="m-code">0,5</span>), zero and other characters are not accepted. The same applies to the other number fields: when you save, an invalid value is replaced with the last valid one.</p>
<h4 class="m-h3" id="r16-6-ekran-koncowy">End screen</h4>
<p class="m-p"><span class="m-strong">End screen mode</span> has three options:</p>
<ul class="m-ul">
<li><span class="m-strong">Logo</span> — the Display shows the game logo;</li>
<li><span class="m-strong">Points</span> — the Display shows the winning team's score (after a finale — together with the points won in the finale);</li>
<li><span class="m-strong">Prize amount</span> (default) — available only in a game with a finale. After the finale, the Display shows an amount: the winning team's points together with the finale points, multiplied by the <span class="m-strong">Prize multiplier</span>, and when the <span class="m-strong">Finale target</span> is reached — increased by the <span class="m-strong">Main prize amount</span>. Example with the default values: 320 points and the target reached gives 320 × 3 + 25,000 = 25,960. The amount and multiplier fields appear only after you choose this option.</li>
</ul>
<p class="m-p">When a game without a finale ends in a draw, the Display always shows the logo.</p>
<p class="m-p">The <span class="m-btn"><i class="ico" data-icon="refresh"></i>Restore defaults</span> button at the bottom of the section restores the default values of these settings only.</p>

<h3 class="m-h2" id="r16-7">16.7 Saving and using the settings</h3>
<p class="m-p"><span class="m-strong">Preview.</span> You can check how the board and the host screen look in the <span class="m-btn">Display</span> section even before saving (<a class="m-ref" href="#r16-3">chapter 16.3</a>). A full overview of the saved settings — teams, appearance, sounds, finale, questions and additional settings — is shown on the <span class="m-page">Summary</span> screen in the Control panel.</p>
<p class="m-p"><span class="m-strong">Saving.</span> Changes are not saved automatically. After each change, the bar shows <span class="m-strong">Unsaved changes</span> — click <span class="m-btn"><i class="ico" data-icon="save"></i>Save</span> to save the settings of all sections at once. When saving, the page checks that:</p>
<ul class="m-ul">
<li>with the finale in <span class="m-strong">Manual</span> mode, exactly 5 questions are chosen;</li>
<li>every sound with the <span class="m-strong">Custom</span> variant has an uploaded file.</li>
</ul>
<p class="m-p">If a question chosen in the settings has been removed from the game in the meantime, it disappears from the selection when you save. If someone changed the same settings somewhere else, saving is stopped so that their changes are not overwritten — refresh the page and make your changes again.</p>
<p class="m-p">When you try to leave the page with unsaved changes (with the <span class="m-btn"><i class="ico" data-icon="arrow-left"></i>Back</span> button, <span class="m-btn"><i class="ico" data-icon="info"></i></span> Help or <span class="m-btn"><i class="ico" data-icon="gamepad"></i>Play</span>), the page asks whether you really want to leave. Confirming discards the unsaved changes.</p>
<p class="m-p"><span class="m-strong">Restoring default values.</span> The <span class="m-btn"><i class="ico" data-icon="refresh"></i>Restore defaults</span> button on the top bar restores the default values in <span class="m-strong">all</span> sections at once: it clears the team names, the question and finale selection, the appearance, the sounds and the additional settings. The change reaches the game after you click <span class="m-btn">Save</span>. The buttons with the same name at the bottom of the <span class="m-btn">Display</span>, <span class="m-btn">Sound</span> and <span class="m-btn">Game settings</span> sections work only within their own section.</p>
<div class="m-warn"><p class="m-p">Restoring all settings immediately deletes the custom sound files of this game — even if you don't save the changes afterwards. This cannot be undone.</p></div>
<p class="m-p"><span class="m-strong">Going to the game.</span> When the game has questions and you opened the settings from the <span class="m-page">My games</span> page, the bar shows the <span class="m-btn"><i class="ico" data-icon="gamepad"></i>Play</span> button — it opens the <span class="m-page">Control panel</span> of this game. Save your changes first. If you opened the settings from the Control panel, there is no <span class="m-strong">Play</span> button — go back with the <span class="m-btn"><i class="ico" data-icon="arrow-left"></i>Back</span> button.</p>
<p class="m-p">In a game with a finale, the button that starts the game in the Summary stays inactive until the finale has 5 questions. The game must also meet the readiness requirements from <a class="m-ref" href="#r7-6">chapter 7.6</a>. Connecting devices and starting the game are described in <a class="m-ref" href="#r17-2">chapter 17.2</a>.</p>
`,
  control: `
<h2 class="m-ch" id="r17">17. Running the game and connecting devices</h2>
<p class="m-p">The live game is run by the <span class="m-strong">operator</span> in the <span class="m-page">Control panel</span>. You get to the panel from the <span class="m-page">My games</span> list or from the <span class="m-page">Game settings</span> page with the <span class="m-btn"><i class="ico" data-icon="gamepad"></i>Play</span> button. The panel is only for running the game — you don't edit questions or poll results in it.</p>
<p class="m-p">This chapter describes the game stage by stage: for each stage you will find what the operator does and, alongside it, what can be seen on the <span class="m-strong">Display</span>, on the <span class="m-strong">host screen</span> and on the <span class="m-strong">Buzzer</span>. The rules of the rounds and the finale are explained in <a class="m-ref" href="#r3">chapter 3</a> and <a class="m-ref" href="#r4">chapter 4</a>, and preparing the settings — in <a class="m-ref" href="#r16">chapter 16</a>.</p>

<h3 class="m-h2" id="r17-1">17.1 Interfaces and connecting devices</h3>

<h4 class="m-h3" id="r17-1-1">17.1.1 Who sees what</h4>
<p class="m-p">The service deliberately separates the screens so that everyone does their own job. The Control panel runs the whole game, and the other interfaces support its presentation and the participants' involvement.</p>
<div class="m-table-wrap"><table class="m-table">
<thead><tr><th>Interface</th><th>Device</th><th>Role</th></tr></thead>
<tbody>
<tr><td><span class="m-page">Control panel</span></td><td>The operator's computer with a large screen</td><td>The operator sees all buttons, the game state, the bank, the strikes (X), hints and the next steps. They control what appears on the board.</td></tr>
<tr><td><span class="m-strong">Display</span></td><td>A TV, projector, second monitor or tablet</td><td>The game board for players and the audience: questions, answers, points, the bank, strikes (X), team scores, and the start and end screens. Required for the game.</td></tr>
<tr><td><span class="m-strong">Host</span> (host screen)</td><td>A tablet or phone</td><td>Shows the host the game stage, the questions and the answers to read out. It does not control the course of the game. Optional.</td></tr>
<tr><td><span class="m-strong">Buzzer</span></td><td>A phone or tablet held horizontally</td><td>Two large buttons in the team colors — used to buzz in during the duel (who is first). It can be replaced by a physical buzzer.</td></tr>
</tbody></table></div>
<p class="m-p">The Display opens on a computer, tablet or TV — not on a phone. The Buzzer works on a phone or tablet; on a phone you will be asked to turn it sideways.</p>
<div class="m-note"><p class="m-p">You can combine the roles of operator and host, but this requires switching smoothly between talking to the participants and using the panel. It is most convenient when the host focuses on the participants and the operator on the service.</p></div>

<h4 class="m-h3" id="r17-1-2">17.1.2 Control panel layout</h4>
<p class="m-p">In the top bar of the panel you will find:</p>
<ul class="m-ul">
<li>the device statuses <span class="m-btn"><i class="ico" data-icon="display"></i>Display</span>, <span class="m-btn"><i class="ico" data-icon="host"></i>Host</span> and <span class="m-btn"><i class="ico" data-icon="buzzer"></i>Buzzer</span> — the dot next to the name shows whether the device is connected. Clicking a status opens a window with the device code (and for the Host and the Buzzer also with a QR code) — this works throughout the game, so you can reconnect a device without going back to the devices step. A device you opt out of (see <a class="m-ref" href="#r17-1-3">17.1.3</a>) disappears from the bar;</li>
<li><span class="m-btn"><i class="ico" data-icon="speaker-on"></i></span> — mutes and unmutes the game sound;</li>
<li><span class="m-btn"><i class="ico" data-icon="refresh"></i></span> — <span class="m-strong">Start over</span> (see <a class="m-ref" href="#r17-5-4">17.5.4</a>);</li>
<li><span class="m-btn"><i class="ico" data-icon="info"></i></span> — help for the current page.</li>
</ul>
<p class="m-p">The main part of the panel changes with the stage: during preparation it shows the devices or the Summary, in the rounds the question and the answer tiles, and in the finale the entry fields or the evaluation of a single answer. The <span class="m-strong">hint column</span> next to it explains who is answering now and what action the game is waiting for. The <span class="m-strong">bar below the board</span> shows current information: in the rounds the team scores, the team in play and the bank, and in the finale the point total. The button for moving on always describes the next step — at important transitions its name changes, e.g. to <span class="m-btn">Go to the final</span> or <span class="m-btn">Finish final</span>.</p>
<p class="m-p"><span class="m-strong">Selecting and confirming.</span> Tiles that change the score or the board (accepting a buzz, revealing an answer in a round, X, passing control, revealing the answer and the points in the finale, the finale timer) work in two steps: the first click selects the tile, the second performs the action. Selecting alone does not change the score. Greyed-out buttons are unavailable — during a sound or an animation, wait until the panel unlocks them.</p>
<div class="m-note"><p class="m-p">You can also use the panel with the keyboard — the shortcuts for the current stage are shown in the hint column under the heading "Keyboard shortcuts". A letter selects an action, and <kbd class="m-kbd">Enter</kbd> performs it. The <kbd class="m-kbd">M</kbd> shortcut mutes or unmutes the sound right away. Letters typed in an active text field remain ordinary text. Shortcuts do not bypass locks, sounds or animations.</p></div>

<h4 class="m-h3" id="r17-1-3">17.1.3 The "Devices" step in the Control panel</h4>
<p class="m-p">The first stage in the panel is connecting the devices. On one screen you see the <span class="m-strong">Display</span>, <span class="m-strong">Host</span> and <span class="m-strong">Buzzer</span> cards, the <span class="m-strong">Sound</span> card and the <span class="m-strong">Test mode</span> option. Each device card has a name, the status <span class="m-code">CONNECTED</span> or <span class="m-code">DISCONNECTED</span> and two rows of buttons of equal width:</p>
<div class="m-table-wrap"><table class="m-table">
<thead><tr><th>Card</th><th>First row</th><th>Second row</th></tr></thead>
<tbody>
<tr><td>Display</td><td>six-digit code with the <span class="m-btn"><i class="ico" data-icon="copy"></i></span> icon · <span class="m-btn"><i class="ico" data-icon="people"></i>Share</span></td><td><span class="m-btn"><i class="ico" data-icon="display"></i>Open</span></td></tr>
<tr><td>Host</td><td>six-digit code with the <span class="m-btn"><i class="ico" data-icon="copy"></i></span> icon · <span class="m-btn"><i class="ico" data-icon="people"></i>Share</span></td><td><span class="m-btn"><i class="ico" data-icon="qr-code"></i>QR Code</span> · <span class="m-btn"><i class="ico" data-icon="qr-code"></i>QR on display</span></td></tr>
<tr><td>Buzzer</td><td>six-digit code with the <span class="m-btn"><i class="ico" data-icon="copy"></i></span> icon · <span class="m-btn"><i class="ico" data-icon="people"></i>Share</span></td><td><span class="m-btn"><i class="ico" data-icon="qr-code"></i>QR Code</span> · <span class="m-btn"><i class="ico" data-icon="qr-code"></i>QR on display</span></td></tr>
</tbody></table></div>
<ul class="m-ul">
<li>The <span class="m-strong">device code</span> is a button — clicking it copies the code so you can pass it on easily. The code is entered on the <span class="m-page">Connect device</span> page (<a class="m-ref" href="#r17-1-4">17.1.4</a>).</li>
<li><span class="m-btn"><i class="ico" data-icon="display"></i>Open</span> opens the Display in a new tab or window of this browser — useful when the board is to be shown on a second monitor connected to the operator's computer.</li>
<li><span class="m-btn"><i class="ico" data-icon="qr-code"></i>QR Code</span> shows a QR code to scan with a phone or tablet.</li>
<li><span class="m-btn"><i class="ico" data-icon="qr-code"></i>QR on display</span> shows the Host or Buzzer QR code on the connected Display, so the team can scan it from the big screen. The same button then changes to <span class="m-btn"><i class="ico" data-icon="eye-off"></i>Hide QR</span>.</li>
<li><span class="m-btn"><i class="ico" data-icon="people"></i>Share</span> sends the device to a chosen person (<a class="m-ref" href="#r17-1-5">17.1.5</a>). The number on the button shows how many people it has already been shared with.</li>
</ul>
<p class="m-p">Below the Host and Buzzer cards there are two options:</p>
<ul class="m-ul">
<li><span class="m-btn">No host tablet</span> — tick it when the host does not have a separate tablet or phone. The Host code and buttons are hidden, connecting it is not required, and the Host status disappears from the top bar. The operator can then run the game alone from the panel — they see the questions and answers on their own screen.</li>
<li><span class="m-btn">Physical buzzer</span> — tick it when, instead of the Buzzer in the browser, you use a physical buzzer (e.g. a hardware one connected some other way). Connecting the Buzzer is then not required, and in the duel the operator indicates which team was first (<a class="m-ref" href="#r17-3-1">17.3.1</a>).</li>
</ul>
<p class="m-p"><span class="m-strong">Sound.</span> On the <span class="m-strong">Sound</span> card, choose where the game sounds should play from: <span class="m-btn">Control panel</span> or <span class="m-btn">Display</span>. Only the selected device plays the sounds. If you choose the Display, you have to click <span class="m-btn"><i class="ico" data-icon="speaker-on"></i>Unlock sound</span> on it — without this you cannot move on.</p>
<div class="m-warn"><p class="m-p">Choose the "Display" source when the sound should play from a separate TV or another device on which the Display is open. With an HDMI cable connection, it is usually more convenient to keep "Control panel" and select the TV as the sound output in the computer settings — after connecting HDMI, the system often does this by itself. With AirPlay, picture and sound from a Mac, iPhone or iPad go to the Apple TV.</p></div>
<p class="m-p"><span class="m-strong">Test mode.</span> To try out the game on one computer, tick <span class="m-btn">Test mode</span>. The Display, Host and Buzzer then appear in the same window, on the right side of the panel, and the other connection options are unavailable. If the window is too small, the panel will ask you to enlarge it. Test mode is for rehearsal — for a real game, use separate devices.</p>
<p class="m-p">The <span class="m-btn"><i class="ico" data-icon="arrow-right"></i>Next</span> button unlocks when the Display, the Host and the Buzzer are connected (unless you opted out of them), and — with sound from the Display — when the sound has been unlocked on it.</p>

<h4 class="m-h3" id="r17-1-4">17.1.4 Connecting with a code or a QR code</h4>
<p class="m-p">You connect each device on the <span class="m-page">Connect device</span> page. On the device that is to play a given role, go to <span class="m-code">familiada.online</span> and click <span class="m-btn"><i class="ico" data-icon="phone"></i>Connect device</span> (on the home page or in the top bar of the <span class="m-page">My games</span> list). The page works without signing in.</p>
<ol class="m-ol">
<li>In the <span class="m-strong">Connect by code</span> card (on the left), enter the six-digit code shown next to the device in the Control panel.</li>
<li>Click <span class="m-btn"><i class="ico" data-icon="arrow-right"></i>Connect</span> or press <kbd class="m-kbd">Enter</kbd>.</li>
<li>In the small window, check the device type, the game name and the owner, then click <span class="m-btn">Connect</span>. The device page opens.</li>
</ol>
<p class="m-p">On a phone and tablet the page also has a <span class="m-btn"><i class="ico" data-icon="camera"></i>Scan QR</span> button — use it to scan the QR code shown in the panel or on the Display. You can also use the system camera. On a phone or tablet you usually connect the Host or the Buzzer, and on a computer or TV — the Display.</p>
<div class="m-note"><p class="m-p">For the Host and the Buzzer, it is most convenient to use the Familiada app installed on your phone. On the <span class="m-page">My games</span> list on your phone, click the <span class="m-btn"><i class="ico" data-icon="download"></i></span> button (Install Familiada) to see installation instructions.</p></div>
<p class="m-p"><span class="m-strong">A TV as a separate device.</span> In the TV's browser, go to <span class="m-code">www.familiada.online</span>. A recognized TV shows the simplified <span class="m-page">Connect display</span> page with a code field and a <span class="m-btn"><i class="ico" data-icon="phone"></i>Connect</span> button. Enter the Display code — you don't need to sign in on the TV or connect it to the computer with a cable. The up and down arrows on the remote switch between the field and the button, and OK or <kbd class="m-kbd">Enter</kbd> confirms. If the TV is not recognized, open the <a href="https://www.familiada.online/connect/tv/" target="_blank" rel="noopener">Connect display</a> page directly. On a TV you can only connect the game Display or a poll's QR Display (<a class="m-ref" href="#r15">chapter 15</a>); Host and Buzzer codes are rejected.</p>
<p class="m-p">If you sign in on the <span class="m-page">Connect device</span> page, you will see the <span class="m-strong">Devices shared with me</span> card on the right (<a class="m-ref" href="#r17-1-5">17.1.5</a>).</p>

<h4 class="m-h3" id="r17-1-5">17.1.5 Sharing a device</h4>
<p class="m-p">Instead of passing on the code, you can share a device with a specific person — e.g. with the host, who is to open the host screen on their tablet. Next to the device card in the Devices step, click <span class="m-btn"><i class="ico" data-icon="people"></i>Share</span>. In the window:</p>
<ul class="m-ul">
<li>enter an email or username in the <span class="m-strong">Email or username</span> field and click <span class="m-btn"><i class="ico" data-icon="envelope-out"></i>Share</span>, or</li>
<li>select people on the <span class="m-strong">Friends you can share with</span> list (<a class="m-ref" href="#r10">chapter 10</a>) and click <span class="m-btn"><i class="ico" data-icon="people"></i>Share with selected</span>.</li>
</ul>
<p class="m-p">The <span class="m-strong">Shared in this session</span> section shows who the device has already been shared with; use the <span class="m-btn"><i class="ico" data-icon="trash"></i></span> button to withdraw the share. Sharing applies to the current game. Another email to the same person can only be sent after the countdown shown next to their name. Sharing is not available in a guest account.</p>
<p class="m-p"><span class="m-strong">Where the recipient will find the shared device:</span></p>
<ul class="m-ul">
<li><span class="m-strong">A person with an account</span> — after signing in on the <span class="m-page">Connect device</span> page, in the <span class="m-strong">Devices shared with me</span> card on the right, and in <span class="m-page">Tasks</span> (<a class="m-ref" href="#r15-4">chapter 15.4</a>). Clicking the tile opens the device. On a phone or tablet the list shows the Host and the Buzzer, and on a computer — the Display.</li>
<li><span class="m-strong">A person without an account</span> — receives an email with an <span class="m-strong">Open</span> button and the device name. They can also find shared devices on the "mails" page (<span class="m-page">My notifications</span>), in the <span class="m-strong">Tasks</span> tab, next to the <span class="m-btn">Connect device</span> button (<a class="m-ref" href="#r14-5">chapter 14.5</a>).</li>
</ul>
<p class="m-p">If the recipient has turned off email notifications, access is granted without a message.</p>

<h4 class="m-h3" id="r17-1-6">17.1.6 The host screen and the cover</h4>
<p class="m-p">The host screen has two parts. On a tablet held upright they are the top and bottom parts, and held sideways — the left and right parts. The first part gives the game stage and, depending on the stage, the question. The second contains the materials for hosting: the answer list, the finale questions or the details of the current matching. The second part can be hidden under a cover.</p>
<div class="m-host"><p class="m-p m-host-title"><span class="m-strong">Host screen</span></p>
<ul class="m-ul">
<li>Upright, swipe the cover <span class="m-strong">down</span> to reveal the content and <span class="m-strong">up</span> to cover it.</li>
<li>Sideways, swipe <span class="m-strong">right</span> to reveal and <span class="m-strong">left</span> to cover.</li>
<li>On the cover and below the revealed content there are hints that match how the device is held.</li>
<li>Revealing is only for the host. It does not reveal answers to the audience and does not confirm any action in the game. The cover protects questions and answers from being seen by players by accident.</li>
<li><span class="m-strong">Every change in the game state brings the cover back</span> if the new stage requires it — after an operator action, another swipe may be needed.</li>
</ul>
<p class="m-p">The cover shows the logo chosen in the game settings, in the variant chosen as the <span class="m-strong">Host logo</span> (<a class="m-ref" href="#r16-3">chapter 16.3</a>).</p>
</div>

<h4 class="m-h3" id="r17-1-7">17.1.7 Device disconnection</h4>
<p class="m-p">When a required device stops responding, the Control panel shows the <span class="m-strong">Connection lost</span> window with the names of the disconnected devices and blocks further game actions. Check the internet connection on the panel and on the devices. If the connection does not come back, connect the device again — you will find the code by clicking its status in the top bar. The game unlocks by itself once all required devices are back; you don't need to refresh the page. Devices you opted out of during preparation do not block the game.</p>
<ul class="m-ul">
<li>Actions confirmed before the disconnection remain saved. When the device comes back, it shows the current game state, without replaying skipped animations. A running countdown keeps going.</li>
<li>If the sound plays from the Display, after it reconnects click <span class="m-btn"><i class="ico" data-icon="speaker-on"></i>Unlock sound</span> on it once more — the button appears by itself, and the panel waits for the click.</li>
<li>If the same device was opened in a second tab or on another phone, the new tab shows the message <span class="m-strong">This device is waiting</span>. Close the previous tab — the waiting screen will switch on by itself.</li>
</ul>
<p class="m-p">Typical causes and solutions are described in <a class="m-ref" href="#r19-5">chapter 19.5</a>.</p>

<h3 class="m-h2" id="r17-2">17.2 Preparing and starting the game</h3>

<h4 class="m-h3" id="r17-2-1">17.2.1 What needs to be ready</h4>
<ul class="m-ul">
<li>The game is ready to play — it has questions and answers, and a poll game has finished voting (<a class="m-ref" href="#r7">chapter 7</a>).</li>
<li>The game settings are prepared on the <span class="m-page">Game settings</span> page (<a class="m-ref" href="#r16">chapter 16</a>) — the Control panel loads them by itself.</li>
<li>The operator has a computer with a large screen on which the question, answers and hints are easy to read.</li>
<li>Separate devices are prepared: the Display (TV or projector), the host's device (if used) and the device with the Buzzer (if you don't use a physical buzzer).</li>
<li>The internet works reliably and the device screens don't turn off — ideally, phones and tablets are plugged into chargers.</li>
</ul>

<h4 class="m-h3" id="r17-2-2">17.2.2 The Display on a TV or projector</h4>
<p class="m-p">Open the Display on a device visible to the participants, in full-screen mode, without browser bars. On a computer and tablet, use the <span class="m-btn"><i class="ico" data-icon="fullscreen-enter"></i></span> (Fullscreen) button on the Display. A TV browser may allow full screen only after you press a button on the remote. Before the game starts, the Display is black.</p>
<p class="m-p"><span class="m-strong">A second screen next to the operator's computer.</span> Turn on extended display mode — on Windows with the <kbd class="m-kbd">Win</kbd> + <kbd class="m-kbd">P</kbd> shortcut, and on a Mac with <kbd class="m-kbd">⌘</kbd> + <kbd class="m-kbd">F1</kbd> (sometimes with an extra <kbd class="m-kbd">Fn</kbd>). Then open the Display with the <span class="m-btn"><i class="ico" data-icon="display"></i>Open</span> button in a new window, drag it to the second screen and turn on full screen. You then control the game on your screen, while the board is visible to others.</p>
<div class="m-warn"><p class="m-p"><span class="m-strong">The Display must be visible during the game.</span> Don't leave the Display tab or window in the background and don't minimize it. The browser may then pause the animations and the board updates, and the panel will wait for them to finish, even if the connection looks active. To rehearse on one computer, use Test mode.</p></div>
<p class="m-p"><span class="m-strong">Sound on the Display.</span> If the Display is the sound source, click <span class="m-btn"><i class="ico" data-icon="speaker-on"></i>Unlock sound</span> on it — on a TV, OK or <kbd class="m-kbd">Enter</kbd> on the remote is enough. The browser requires this click every time the Display is opened. Don't reload the Display during the game, and check the volume of the TV or speakers themselves.</p>

<h4 class="m-h3" id="r17-2-3">17.2.3 Settings summary</h4>
<p class="m-p">After the Devices step, the panel shows the <span class="m-page">Summary</span> of the settings for this game:</p>
<ul class="m-ul">
<li><span class="m-strong">Teams</span> — the names of both teams (empty fields in the settings mean the names "Team A" and "Team B").</li>
<li><span class="m-strong">Appearance</span> — colors, theme, logo and the host logo variant, with a Display preview and a host logo preview.</li>
<li><span class="m-strong">Sound</span> — the variant of each sound, a volume slider and a <span class="m-btn"><i class="ico" data-icon="play"></i></span> button to listen. Changing the volume here applies only to the current game; the next time you start it, the values from the game settings are loaded.</li>
<li><span class="m-strong">Final</span> — whether the game has a finale.</li>
<li><span class="m-strong">Game settings</span> — only those additional settings that differ from the defaults (e.g. round multipliers, point targets, how the game ends).</li>
<li><span class="m-strong">Round questions</span> and <span class="m-strong">Final questions</span> — the fixed order or the drawn set. With a draw, you can use <span class="m-btn">Reshuffle</span> next to the given section to change the set before the start.</li>
</ul>
<p class="m-p"><span class="m-btn"><i class="ico" data-icon="settings"></i>Change settings</span> opens the <span class="m-page">Game settings</span> page; when you come back, the panel loads the changes. <span class="m-btn"><i class="ico" data-icon="arrow-left"></i>Back</span> returns to the Devices step without losing the connections. The <span class="m-btn">Done — start the game<i class="ico" data-icon="arrow-right"></i></span> button is unavailable when the finale does not have five questions or when the sound on the Display has not been unlocked.</p>
<div class="m-host"><p class="m-p m-host-title"><span class="m-strong">Host screen</span></p>
<p class="m-p">Shows the logo chosen in the game settings. If this logo was being edited before, it shows the default Familiada logo; once the operator enters the Summary, it loads the chosen logo again.</p></div>
<p class="m-p">In the Summary, the Display stays black and the Buzzer is dimmed.</p>

<h4 class="m-h3" id="r17-2-4">17.2.4 Starting the game</h4>
<div class="m-table-wrap"><table class="m-table">
<thead><tr><th>Operator</th><th>Display</th><th>Host</th><th>Buzzer</th></tr></thead>
<tbody>
<tr><td>Clicks <span class="m-btn">Done — start the game<i class="ico" data-icon="arrow-right"></i></span>.</td><td>Turns on and shows the team names and scores, without the logo or the board.</td><td>No materials to read.</td><td>Visible, but not accepting presses yet.</td></tr>
<tr><td>Clicks <span class="m-btn">Start game</span>.</td><td>The intro music plays and an animated logo appears.</td><td>No materials to read.</td><td>No change.</td></tr>
<tr><td>After the intro, clicks <span class="m-btn">Start</span> (start the round).</td><td>An empty round board with spaces for the answers appears.</td><td>Duel stage; question under the cover (<a class="m-ref" href="#r17-3-1">17.3.1</a>).</td><td>Active after the board animation ends.</td></tr>
</tbody></table></div>
<div class="m-note"><p class="m-p">After clicking <span class="m-btn">Done — start the game<i class="ico" data-icon="arrow-right"></i></span> you can leave the panel in this state until the actual start. From then on, you run the next stages at TV pace.</p></div>

<h3 class="m-h2" id="r17-3">17.3 Running the rounds</h3>
<p class="m-p">In the rounds, the panel shows the question, up to six answer tiles with points (from the highest-scoring), the <span class="m-btn">X</span> and <span class="m-btn">3s</span> (3-second countdown) tiles, the hint column and a bar with the team scores, the team in play (<span class="m-strong">Playing:</span>) and the bank (<span class="m-strong">Bank:</span>). The Display shows the board: hidden answer spaces, the bank at the top, the team scores on the sides and an indicator of the team that is answering now. The round rules are described in <a class="m-ref" href="#r3">chapter 3</a>.</p>

<h4 class="m-h3" id="r17-3-1">17.3.1 The duel</h4>
<p class="m-p">Every question starts with a duel between team representatives. On the Buzzer, the players press their button — the button of the team that was first lights up immediately, and the other dims. The panel shows the <span class="m-btn">Accept: …</span> tile with the name of that team; select it and click again to accept the buzz. If the buzz has to be repeated (e.g. a false start), click <span class="m-btn">Retry</span> — the buzzer will accept presses again. The winning button stays lit until the end of the question.</p>
<p class="m-p"><span class="m-strong">Physical buzzer.</span> When this option is ticked, the panel shows two tiles with the team names. Click the team that pressed first — its tile lights up — and then confirm the <span class="m-btn">Accept: …</span> tile with its name with two clicks. To change your choice before confirming, click the other team.</p>
<p class="m-p">Once the buzz is accepted, the indicated team answers, and the indicator on the Display lights up on its side. The operator selects and confirms the correct answer or adds an X:</p>
<ul class="m-ul">
<li>hitting the <span class="m-strong">highest-scoring</span> answer wins the duel immediately;</li>
<li>in every other case (a different answer or an X) the other team answers; the duel is won by the team whose answer has more points, and with equal points — by the team that answered first;</li>
<li>if both teams miss, the turn goes back to the team that answered first — without pressing the buttons again.</li>
</ul>
<p class="m-p">The points of answers revealed in the duel go to the bank. The winner of the duel takes over the game — the panel shows it in the bar as the team in play.</p>
<div class="m-host"><p class="m-p m-host-title"><span class="m-strong">Host screen</span></p>
<p class="m-p">The title <span class="m-code">ROUND 1 — BUZZER</span> means the duel — also after the operator accepts the buzz. The number in the title changes with the round. You will see the question and the full answer list with points after revealing the second part; the cover protects the question from the players before it is asked.</p></div>

<h4 class="m-h3" id="r17-3-2">17.3.2 Passing the question</h4>
<p class="m-p">Right after winning the duel, the team can pass the question to the opponents. The panel then shows the <span class="m-btn">Pass control</span> tile — select it and confirm with a second click. The option is available once per question and only until the first answer or first X of the team in play.</p>
<div class="m-host"><p class="m-p m-host-title"><span class="m-strong">Host screen</span></p>
<p class="m-p">When control can be passed, a red, underlined hint "Control can be passed to the other team." appears in the first part. The operator carries out the team's decision in the panel.</p></div>

<h4 class="m-h3" id="r17-3-3">17.3.3 Revealing answers and the bank</h4>
<p class="m-p">The team in play gives further answers, and the operator selects and confirms the correct ones. On the Display, the answer text is revealed, then its points, and at the end of the animation the new bank total; the correct-answer sound plays. The tile of a revealed answer in the panel turns green and does not award points a second time. The bank is the points from the current question — they go to the team's score only when the round ends.</p>
<div class="m-host"><p class="m-p m-host-title"><span class="m-strong">Host screen</span></p>
<p class="m-p"><span class="m-code">ROUND 1 — PLAY</span> means the team's play after the duel. The question is already visible in the first part. The second part has the full answers with points, including those still hidden on the Display — e.g. the row <span class="m-code">2) Bicycle (24)</span> means the second answer worth 24 points. A green row is an answer revealed to the audience. The host screen does not show the bank, X or scores — check them on the Display.</p></div>

<h4 class="m-h3" id="r17-3-4">17.3.4 Strikes (X) and the 3-second countdown</h4>
<p class="m-p">Mark a wrong answer with the <span class="m-btn">X</span> tile (select and confirm). An X appears on the Display on the team's side and the wrong-answer sound plays. During the team's play, the tile also shows a counter, e.g. <span class="m-code">1 / 3</span>.</p>
<p class="m-p">When an answer takes too long, click <span class="m-btn">3s</span> (a single click). The tile shows the remaining seconds; clicking again stops the countdown. When the time runs out, the game adds an X by itself — just like no answer on the TV show. Only the operator sees the countdown — the Display does not show it, and the host can signal the end of time, e.g. by calling out "Time!". Revealing an answer or adding an X interrupts the countdown.</p>
<p class="m-p">The third X of the team in play, while hidden answers remain on the board, starts an attempt to steal the points.</p>

<h4 class="m-h3" id="r17-3-5">17.3.5 Stealing the points</h4>
<p class="m-p">After the third X, the question goes to the opposing team, which has <span class="m-strong">one</span> answer. The panel bar shows <span class="m-strong">Steal:</span> and the name of that team. If they get it right, reveal their answer — the bank together with this answer goes to them. If they miss, add an X — the bank stays with the team in play. The stealing rules are described in <a class="m-ref" href="#r3">chapter 3</a>.</p>
<div class="m-host"><p class="m-p m-host-title"><span class="m-strong">Host screen</span></p>
<p class="m-p">The title changes to <span class="m-code">ROUND 1 — STEAL</span>. The question stays visible, and the answer list is available under the cover. Which team is trying and what the result is, you can check in the panel and on the Display.</p></div>

<h4 class="m-h3" id="r17-3-6">17.3.6 Ending the question and the round</h4>
<p class="m-p">The question is settled when all answers have been revealed, the team in play has three X with no hidden answers left, or the steal attempt has ended. The bar then shows the <span class="m-btn">End round</span> button. After you click it, the bank — multiplied by this round's multiplier — goes to the right team's score, and the Display updates the scores. The hint column says how many points were awarded.</p>
<p class="m-p">If hidden answers remain on the board, the panel moves to revealing: click the remaining tiles (select and confirm) to show them to the audience. These answers no longer give points. The button for moving on unlocks only after all of them have been revealed.</p>
<div class="m-host"><p class="m-p m-host-title"><span class="m-strong">Host screen</span></p>
<p class="m-p"><span class="m-code">ROUND 1 — REVEAL</span> means showing the remaining answers after the bank is settled. Each newly revealed row turns green.</p></div>
<div class="m-note"><p class="m-p">The panel deliberately separates settling the question from ending the round. The board stays on the Display until you click, so the host has time to deliver the punchline.</p></div>

<h4 class="m-h3" id="r17-3-7">17.3.7 Moving to the next round, the finale or the end of the game</h4>
<p class="m-p">After each round, the game checks whether a team has reached the threshold set in the additional settings (300 points by default, <a class="m-ref" href="#r16-6">chapter 16.6</a>). The button in the bar is labeled in advance:</p>
<ul class="m-ul">
<li><span class="m-btn">Go to next round</span> — the threshold has not been reached and there are still questions. The panel shows the current scores and the <span class="m-btn">Start</span> button (start the round); the Display keeps the board until the next round starts.</li>
<li><span class="m-btn">Go to the final</span> — the threshold has been reached, and the finale is on and has five questions (<a class="m-ref" href="#r17-4">17.4</a>).</li>
<li><span class="m-btn">Go to end of game</span> — the threshold has been reached without a finale, or the round questions have run out. It appears instead of <span class="m-btn">End round</span>: it settles the bank and shows the end screen right away. The other round actions are blocked, and you don't reveal the missing answers (<a class="m-ref" href="#r17-5-2">17.5.2</a>).</li>
</ul>
<div class="m-warn"><p class="m-p">Running out of questions alone does not lead to the finale — the finale requires reaching the threshold. Choose the number of questions and the threshold so that the questions don't run out before the planned finale.</p></div>

<h4 class="m-h3" id="r17-3-8">17.3.8 Shortcuts in the rounds</h4>
<div class="m-table-wrap"><table class="m-table">
<thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
<tbody>
<tr><td><kbd class="m-kbd">C</kbd> → <kbd class="m-kbd">Enter</kbd></td><td>Accept the buzz from the Buzzer.</td></tr>
<tr><td><kbd class="m-kbd">A</kbd> / <kbd class="m-kbd">B</kbd> → <kbd class="m-kbd">Enter</kbd></td><td>Physical buzzer: choose a team and confirm.</td></tr>
<tr><td><kbd class="m-kbd">1</kbd>–<kbd class="m-kbd">6</kbd> → <kbd class="m-kbd">Enter</kbd></td><td>Reveal an answer.</td></tr>
<tr><td><kbd class="m-kbd">X</kbd> → <kbd class="m-kbd">Enter</kbd></td><td>Add an X.</td></tr>
<tr><td><kbd class="m-kbd">T</kbd> → <kbd class="m-kbd">Enter</kbd></td><td>3-second countdown.</td></tr>
<tr><td><kbd class="m-kbd">P</kbd> → <kbd class="m-kbd">Enter</kbd></td><td>Pass control.</td></tr>
<tr><td><kbd class="m-kbd">N</kbd> → <kbd class="m-kbd">Enter</kbd></td><td>The button for moving on.</td></tr>
<tr><td><kbd class="m-kbd">E</kbd> → <kbd class="m-kbd">Enter</kbd>, <kbd class="m-kbd">B</kbd> → <kbd class="m-kbd">Enter</kbd></td><td>In the Summary: change settings, go back.</td></tr>
</tbody></table></div>

<h3 class="m-h2" id="r17-4">17.4 Running the finale</h3>
<p class="m-p">In the finale, two players answer the same <span class="m-strong">5 questions</span>, and their points are added together. The goal is the finale target — <span class="m-strong">200 points</span> by default (<a class="m-ref" href="#r16-6">chapter 16.6</a>). Usually two people from the winning team play. The finale rules are described in <a class="m-ref" href="#r4">chapter 4</a>.</p>

<h4 class="m-h3" id="r17-4-1">17.4.1 Preparing the finale</h4>
<p class="m-p">After <span class="m-btn">Go to the final</span>, the panel shows the <span class="m-strong">Start</span> screen of the finale. The Display keeps the board of the last round with the current scores. The host screen is empty — the materials will appear once answer entry begins. The Buzzer is dimmed until the end of the game.</p>
<p class="m-p">Prepare a waiting area and headphones with music for the second player: while the first player answers, they must not hear them or see the board.</p>
<p class="m-p">Click <span class="m-btn">Start</span> (start the finale). The finale music plays, and the Display shows the finale board. The winning team's score stays visible, a timer (<span class="m-code">15</span>) appears in place of the other team's score, and the finale total is shown at the top. The indicator lights up on the side of the team playing the finale.</p>

<h4 class="m-h3" id="r17-4-2">17.4.2 Player 1 — entering answers</h4>
<p class="m-p">Make sure the second player is waiting away from the game. The host reads the questions one by one, and the operator types the answers into the fields next to the questions. The answers are not yet evaluated or shown to the audience.</p>
<ul class="m-ul">
<li>The first player's timer has <span class="m-strong">15 seconds</span>. It does not start by itself — start it with the <span class="m-btn">Start countdown (15s)</span> button (select and confirm) or with the <kbd class="m-kbd">Ctrl</kbd> + <kbd class="m-kbd">Enter</kbd> shortcut (on a Mac <kbd class="m-kbd">⌘</kbd> + <kbd class="m-kbd">Enter</kbd>). On the Display the timer counts down.</li>
<li>You can stop the countdown with the same button or shortcut only after text has been entered in all five fields. The timer can be started only once per player; after that the button shows <span class="m-code">Time used</span>.</li>
<li><kbd class="m-kbd">Enter</kbd> and the down arrow move to the next empty field, and the up arrow — to the previous empty one. After the last question you return to the first. To correct a filled-in answer, click its field. An empty field means nothing has been entered, not a final evaluation.</li>
<li><span class="m-btn"><i class="ico" data-icon="arrow-right"></i>Next</span> unlocks after the countdown has been used and has finished. When the time runs out naturally, you can move on even with gaps.</li>
</ul>
<div class="m-note"><p class="m-p">After the time is up, you can correct typos and fill in an answer you remember while the host is still talking to the player. Corrections are also possible during matching — until the given answer is revealed.</p></div>
<div class="m-host"><p class="m-p m-host-title"><span class="m-strong">Host screen</span></p>
<p class="m-p">The first part shows <span class="m-code">FINAL ROUND 1</span> (for the second player <span class="m-code">FINAL ROUND 2</span>). After the timer starts, the title also includes the remaining time, e.g. <span class="m-code">FINAL ROUND 1 — COUNTDOWN 12s</span>. The second part shows the five numbered questions and the entry status:</p>
<div class="m-table-wrap"><table class="m-table">
<thead><tr><th>Status next to the question</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td><span class="m-code">entered</span></td><td>The operator has saved the answer text. This does not yet mean a hit or points.</td></tr>
<tr><td><span class="m-code">missing</span></td><td>The answer field is empty. This does not mean the player has definitely skipped the question.</td></tr>
<tr><td><span class="m-code">repeat</span></td><td>For player 2: the operator has marked the answer as a repeat of player 1's. When revealed, it gives zero points.</td></tr>
</tbody></table></div>
<p class="m-p">The host reads the questions and sees where the operator already has an entry — the screen shows the statuses, <span class="m-strong">not the content of the entered answers</span>. The entry text appears during matching.</p></div>

<h4 class="m-h3" id="r17-4-3">17.4.3 Player 1 — matching and revealing</h4>
<p class="m-p">The panel takes you through the questions one by one (<span class="m-strong">Final — mapping 1/5</span> and so on). For each question you see the <span class="m-strong">Entered</span> field with the player's answer and choice tiles — you select them with a single click:</p>
<ul class="m-ul">
<li>an answer from the list, e.g. <span class="m-btn">Bicycle (24)</span> — when the entry matches a scored answer;</li>
<li><span class="m-btn">Not on the list (0 pts)</span> — the entry is not on the list; the Display will show the entered answer word for word and zero points;</li>
<li><span class="m-btn">No answer</span> — the field is empty.</li>
</ul>
<p class="m-p">Then reveal the result: <span class="m-btn">Show answer</span>, and then <span class="m-btn">Show points</span> (select and confirm each). Below the tile name you can see what will appear on the board. For a hit, the text is revealed with the reveal sound, and the points — with the correct-answer sound. For an entry not on the list, the text is revealed with the reveal sound, and the zero — with the wrong-answer sound. <span class="m-btn">No answer</span> shows an empty answer and zero at once with a single reveal, with the wrong-answer sound. Matching alone does not add points — the total grows when the points are revealed. After the answer is revealed, you can no longer change the entry or the matching.</p>
<p class="m-p">The <span class="m-btn"><i class="ico" data-icon="arrow-right"></i>Next</span> button in the bar with the <span class="m-strong">Final sum</span> moves to the next question after the points are revealed.</p>
<div class="m-note"><p class="m-p">If you want to show an off-list answer word for word, correct any typos in the <span class="m-strong">Entered</span> field beforehand.</p></div>
<div class="m-host"><p class="m-p m-host-title"><span class="m-strong">Host screen</span></p>
<p class="m-p">The first part shows e.g. <span class="m-code">FINAL — REVEAL (ROUND 1)</span> and <span class="m-code">Question 3: …</span> — the number of the question being evaluated. "ROUND 2" means the second player. The second part contains:</p>
<ol class="m-ol">
<li><span class="m-code">Player 1: …</span> — only for the second player: the first player's earlier, selected answer to the same question; <span class="m-code">—</span> means no answer.</li>
<li><span class="m-code">Entered: …</span> — the text entered by the operator for the current player. The row is missing when there is no entry or a repeat has been marked.</li>
<li><span class="m-code">Status: …</span> — the current matching, according to the table below.</li>
<li><span class="m-code">Answer list:</span> — all answers to this question with points in brackets, from the highest-scoring.</li>
</ol>
<div class="m-table-wrap"><table class="m-table">
<thead><tr><th>Status</th><th>Look</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td><span class="m-code">from list</span></td><td>Green text; the selected answer on the list is green and crossed out.</td><td>The entry was assigned to an answer from the list. Crossing out marks the selected item, <span class="m-strong">not an error or cancellation</span>.</td></tr>
<tr><td><span class="m-code">not on list</span></td><td>Yellow text.</td><td>There is an entry, but it was not assigned to an answer from the list. The Display will show the entry word for word, and after the points are revealed — zero. You can change this before revealing.</td></tr>
<tr><td><span class="m-code">no answer</span></td><td>Red text.</td><td>The current player has no entered answer.</td></tr>
<tr><td><span class="m-code">repeat</span></td><td>Yellow text.</td><td>The second player's answer was marked as a repeat; it gives no points.</td></tr>
</tbody></table></div>
<p class="m-p"><span class="m-strong">The colors describe the matching, not what the audience can already see.</span> A green "from list" does not mean the answer or points are already revealed. The operator's entry and the selected answer may be worded differently, e.g. the entry "by bike" matched to "Bicycle (24)".</p></div>

<h4 class="m-h3" id="r17-4-4">17.4.4 Player 2 — preparation and entering answers</h4>
<p class="m-p">If the target has not been reached, after the first player's fifth question the panel shows the <span class="m-strong">Start Player 2</span> screen. Player 1's answers on the Display are then hidden, and the host screen is empty — the second player can come back to their place. Remind them of the rules; with the <span class="m-btn">Repeat sound</span> button you can demonstrate the repeat signal.</p>
<p class="m-p"><span class="m-btn">Start</span> (start round 2) brings back player 1's revealed answers on the Display — the second player stands with their back to the board so as not to see them. The operator sees them in the panel next to each question (<span class="m-strong">Player 1 answer:</span>), which helps to recognize a repeat. The timer has <span class="m-strong">20 seconds</span>, and you start it the same way as for the first player (<span class="m-btn">Start countdown (20s)</span>).</p>
<p class="m-p">When the player repeats the first player's answer, click <span class="m-btn">Repeat</span> next to that question (a single click, the field must be empty) and ask for a different answer. Each click plays the repeat sound, even when the mark is already on. <span class="m-strong">Clicking again does not remove the mark.</span> While time remains, the host can go back to skipped questions, including those with a repeat, and the player can correct themselves. Entering a new answer removes the repeat mark by itself; just placing the cursor in the field does not.</p>
<div class="m-note"><p class="m-p">Questions can be read in further passes until the time runs out. A player saying "Pass" does not close the question for the rest of the round.</p></div>
<p class="m-p">The host screen shows the title <span class="m-code">FINAL ROUND 2</span>, the countdown after the timer starts and the five questions with entry statuses (<a class="m-ref" href="#r17-4-2">17.4.2</a>).</p>

<h4 class="m-h3" id="r17-4-5">17.4.5 Player 2 — matching and revealing</h4>
<p class="m-p">You match and reveal the second player's answers the same way as the first player's (<a class="m-ref" href="#r17-4-3">17.4.3</a>). Next to the <span class="m-strong">Entered</span> field, the panel shows a <span class="m-strong">Player 1</span> tile with the earlier answer — it doesn't have to be worded exactly like the current entry. The choice tiles also include <span class="m-btn">Repeat</span>: during matching it is only a mark and does not play the repeat sound. When revealing, it works like no answer — it shows zero at once with the wrong-answer sound. Both players' points go to the same total at the top of the Display.</p>

<h4 class="m-h3" id="r17-4-6">17.4.6 When the finale ends</h4>
<p class="m-p">When the total reaches the finale target, further evaluations are blocked, the hint column reports that the target has been reached, and the button in the bar changes to <span class="m-btn">Finish final</span> — for the first or the second player. The result does not appear by itself: you choose the moment to finish. If the target has not been reached, <span class="m-btn">Finish final</span> appears after the second player's last points are revealed. Next — <a class="m-ref" href="#r17-5-1">17.5.1</a>.</p>
<div class="m-note"><p class="m-p">The Display fits 17 answer characters in the rounds and 11 in the finale, including spaces. Longer text is shortened only on the board; the full text remains in the panel and on the host screen. A dot at the end marks a cut-off word.</p></div>

<h4 class="m-h3" id="r17-4-7">17.4.7 Shortcuts in the finale</h4>
<div class="m-table-wrap"><table class="m-table">
<thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
<tbody>
<tr><td><kbd class="m-kbd">Ctrl</kbd> + <kbd class="m-kbd">Enter</kbd> (Mac: <kbd class="m-kbd">⌘</kbd> + <kbd class="m-kbd">Enter</kbd>)</td><td>Entry: start or stop the timer.</td></tr>
<tr><td><kbd class="m-kbd">↑</kbd> / <kbd class="m-kbd">↓</kbd> / <kbd class="m-kbd">Enter</kbd></td><td>Entry: previous / next empty field.</td></tr>
<tr><td><kbd class="m-kbd">Shift</kbd> + <kbd class="m-kbd">Enter</kbd></td><td>Second player's entry, in an empty field: Repeat with sound (pressing again plays the sound again).</td></tr>
<tr><td><kbd class="m-kbd">1</kbd>–<kbd class="m-kbd">6</kbd></td><td>Matching: an answer from the list.</td></tr>
<tr><td><kbd class="m-kbd">W</kbd> / <kbd class="m-kbd">O</kbd> / <kbd class="m-kbd">R</kbd></td><td>Matching: written answer (not on the list) / no answer / repeat (player 2).</td></tr>
<tr><td><kbd class="m-kbd">Enter</kbd></td><td>Matching: reveal the answer, another <kbd class="m-kbd">Enter</kbd> — the points.</td></tr>
<tr><td><kbd class="m-kbd">I</kbd></td><td>Matching: go to the Entered field; <kbd class="m-kbd">Enter</kbd> in the field saves the entry and leaves the field.</td></tr>
<tr><td><kbd class="m-kbd">N</kbd> → <kbd class="m-kbd">Enter</kbd></td><td>The button for moving on.</td></tr>
</tbody></table></div>

<h3 class="m-h2" id="r17-5">17.5 Ending the game</h3>

<h4 class="m-h3" id="r17-5-1">17.5.1 Ending after the finale</h4>
<p class="m-p"><span class="m-btn">Finish final</span> shows on the Display the end screen chosen in the settings: the logo, the points or the prize amount (<a class="m-ref" href="#r16-6">chapter 16.6</a>). It is revealed together with the finale music, and the winning team's indicator stays lit. The host screen is cleared — watch the result on the Display.</p>
<p class="m-p">The panel shows the <span class="m-strong">End</span> screen with the finale total. Click <span class="m-btn">Finish game</span>: the game plays only the "Show outro music", the finale points are added to the team's score, and the picture on the Display does not change.</p>

<h4 class="m-h3" id="r17-5-2">17.5.2 Ending without a finale</h4>
<p class="m-p">When the finale is off and the threshold has been reached, or when the round questions have run out, click <span class="m-btn">Go to end of game</span>. The bank is settled, and the Display shows the end screen: the logo or the winning team's points. With the "Show prize amount (after finale)" option selected, a game without a finale shows the points, and in a draw it always shows the logo. The host screen is cleared.</p>
<p class="m-p">The panel shows the <span class="m-strong">End</span> screen with a preview of what will appear on the Display. Click <span class="m-btn">Finish game</span> to play the "Show outro music".</p>

<h4 class="m-h3" id="r17-5-3">17.5.3 The panel's end screen</h4>
<p class="m-p">After <span class="m-btn">Finish game</span>, the panel gives the result, e.g. "Team … won with a score of 320:180" or "Draw", and two buttons:</p>
<ul class="m-ul">
<li><span class="m-btn">Start over</span> — a new game session of the same game (<a class="m-ref" href="#r17-5-4">17.5.4</a>);</li>
<li><span class="m-btn">Back to my games</span> — closes the panel.</li>
</ul>
<p class="m-p">The Display stays on the end screen. Finish the game with the buttons on this screen, not by closing the panel tab. Changing the game settings during a running game requires interrupting it (<a class="m-ref" href="#r19-4">chapter 19.4</a>).</p>

<h4 class="m-h3" id="r17-5-4">17.5.4 Starting the game again</h4>
<p class="m-p">The <span class="m-btn"><i class="ico" data-icon="refresh"></i></span> (Start over) button in the top bar works at any time. After you confirm, the panel goes back to the Devices step and resets the game progress (teams, questions, scores), and stops the sounds and pending actions of the previous game. Connected devices and additional settings stay. Start over has no keyboard shortcut.</p>
<p class="m-p">Problems with connecting devices, the picture or the sound are described in <a class="m-ref" href="#r19-5">chapter 19.5</a>.</p>
`,
  help: `
<h2 class="m-ch" id="r19">19. Troubleshooting</h2>
<p class="m-p">This chapter takes you from a symptom to a possible solution. Find the description of the situation that applies to you, follow the steps given, and for a full description of the feature go to the chapter indicated. If no description fits, write to us (<a class="m-ref" href="#r19-6">chapter 19.6</a>).</p>

<h3 class="m-h2" id="r19-1">19.1 Account and access problems</h3>
<p class="m-p"><span class="m-strong">I can't sign in — message "Wrong email or password."</span></p>
<ul class="m-ul">
<li>Check that you are typing the address or username without typos and that <kbd class="m-kbd">Caps Lock</kbd> is not on.</li>
<li>If you don't remember your password, click <span class="m-btn"><i class="ico" data-icon="envelope"></i>Forgot password</span> and set a new password from the message you receive (<a class="m-ref" href="#r5-7">chapter 5.7</a>).</li>
</ul>
<p class="m-p"><span class="m-strong">Message "I don't know this email or the account doesn't exist." or "I don't know this username."</span> — there is no account with this address or name. Check the spelling or try the other way of signing in (address instead of name, or the other way round). If you don't have an account yet, create one (<a class="m-ref" href="#r5-2">chapter 5.2</a>).</p>
<p class="m-p"><span class="m-strong">Message "You changed your email. Log in with the new address."</span> — the address change has already been confirmed. Use the new address to sign in.</p>
<p class="m-p"><span class="m-strong">A "Confirm you are human" window appears</span> — after three failed sign-in attempts, the service asks for additional verification. Complete it and click <span class="m-btn">Continue</span>. If a verification error appears, refresh the page and try again.</p>
<p class="m-p"><span class="m-strong">Message "Too many requests. Try again later."</span> — wait a moment and sign in again.</p>

<h4 class="m-h3" id="r19-1-1">19.1.1 Confirming your email address</h4>
<p class="m-p"><span class="m-strong">Message "Confirm your email (link in inbox)."</span> — the account has not been activated yet. Open the message with the activation link and click the link.</p>
<ul class="m-ul">
<li><span class="m-strong">I can't see the message</span> — check your spam folder and the other tabs of your inbox. If the message still isn't there, try signing up again: the service will offer <span class="m-btn">Resend email</span>. You can resend once an hour.</li>
<li><span class="m-strong">"This email is already registered."</span> or <span class="m-strong">"This account already exists. Switching to login."</span> — an account with this address already exists. Sign in, and if you don't remember the password, reset it.</li>
<li><span class="m-strong">"The link is invalid or expired."</span> or <span class="m-strong">"This link has already been used."</span> — the link has expired or the account is already confirmed. Try signing in; if needed, ask for a new link or a password reset.</li>
<li><span class="m-strong">"Active session on this device" window</span> — another account is signed in in this browser. Choose <span class="m-btn">Sign out and continue</span> or open the link in a private browser window.</li>
</ul>

<h4 class="m-h3" id="r19-1-2">19.1.2 Password reset and address change</h4>
<ul class="m-ul">
<li><span class="m-strong">"The link was already sent. Try again in…"</span> — you can ask for a new password reset link once an hour. Look for the earlier message, also in the spam folder.</li>
<li><span class="m-strong">"New password must be different from the old password."</span> or a message about password rules — the password must have at least 8 characters and contain a lowercase letter, an uppercase letter, a digit and a special character (<a class="m-ref" href="#r5-6">chapter 5.6</a>).</li>
<li><span class="m-strong">The email address change doesn't finish</span> — the change has to be confirmed with links sent to both the current and the new address. After clicking the first link, you will see "First link confirmed." — then click the link from the other inbox too. Until then, you sign in with your current address. In <span class="m-page">Account settings</span> you can resend the links or cancel the change (<a class="m-ref" href="#r5-6">chapter 5.6</a>).</li>
<li><span class="m-strong">I no longer have access to my current email address</span> — export your important games, question bases and logos, delete the account, create a new one with the right address and import the data again (<a class="m-ref" href="#r5-9">chapter 5.9</a>).</li>
</ul>

<h4 class="m-h3" id="r19-1-3">19.1.3 Guest account</h4>
<ul class="m-ul">
<li><span class="m-strong">Guest data has disappeared</span> — guest account data is stored only in the browser in which you use it. Clearing the browser history cuts off access to it, and a guest account is deleted 5 days after the last sign-in. To avoid this, turn it into a registered account (<a class="m-ref" href="#r5-4">chapter 5.4</a>).</li>
<li><span class="m-strong">"Active guest session" window when signing in</span> — signing in to another account will delete the guest data. If it is important, choose <span class="m-btn">Cancel</span> and first export it or move it to a registered account.</li>
<li><span class="m-strong">Message "Not available for guest account"</span> — Friends, Subscribers, Tasks and sharing require a registered account. Click <span class="m-btn">Sign in / Create account</span>.</li>
</ul>

<h3 class="m-h2" id="r19-2">19.2 Problems with games and resources</h3>
<p class="m-p"><span class="m-strong">"In use elsewhere" window</span> — a game, logo or question base item is currently open in another tab, on another device or by another user. The same resource can be changed in only one place at a time. Close it where it is open and try again.</p>
<ul class="m-ul">
<li><span class="m-strong">"This game is open elsewhere."</span> — the game is open in the editor, the settings, a poll or the <span class="m-page">Control panel</span>.</li>
<li><span class="m-strong">"The game is currently being run in the Control panel — changes are locked…"</span> — finish the game or end it (<a class="m-ref" href="#r19-4">chapter 19.4</a>). If the Control panel was closed during the game, the lock expires after an hour without activity.</li>
<li><span class="m-strong">"A logo is being edited — close the logo editor…"</span> or <span class="m-strong">"You can't edit or delete a logo while playing a game."</span> — while a logo is being edited you cannot open a game or the game settings, and while a game is running or the game settings are open you cannot change a logo. Close one before you open the other (<a class="m-ref" href="#r8-5">chapter 8.5</a>).</li>
<li><span class="m-strong">"Lock lost"</span> — another tab has taken over the resource, for example after the computer went to sleep. Refresh the page.</li>
<li><span class="m-strong">"This was deleted"</span> or <span class="m-strong">"Editing access lost"</span> — someone has deleted the resource or withdrawn your permission to edit it (<a class="m-ref" href="#r12-5">chapter 12.5</a>).</li>
</ul>

<h4 class="m-h3" id="r19-2-1">19.2.1 Editing and game readiness</h4>
<ul class="m-ul">
<li><span class="m-strong">"The poll is open — editing is locked."</span> or <span class="m-strong">"The poll is stopped — editing is locked."</span> — a game with an ongoing poll cannot be changed. Count the votes or abort the poll (<a class="m-ref" href="#r7-5">chapter 7.5</a>, <a class="m-ref" href="#r15-5">chapter 15.5</a>).</li>
<li><span class="m-strong">"Community games can't be edited."</span> — games added from the Community Games catalog can be played, but they cannot be edited, exported, duplicated or sent (<a class="m-ref" href="#r13-4">chapter 13.4</a>).</li>
<li><span class="m-strong">I can't start the game — a message about missing items</span>, for example that the game needs at least 10 questions or that a question must have 3–6 answers — complete the indicated questions. All the requirements are described in <a class="m-ref" href="#r7-6">chapter 7.6</a>.</li>
<li><span class="m-strong">"The game will be playable once the poll is closed."</span> — a poll game becomes ready only after the votes are counted (<a class="m-ref" href="#r15-6">chapter 15.6</a>).</li>
<li><span class="m-strong">"The answer contains characters the Display does not have"</span> — remove the indicated characters (for example emoji) to save the answer (<a class="m-ref" href="#r7-3">chapter 7.3</a>).</li>
</ul>

<h4 class="m-h3" id="r19-2-2">19.2.2 Import and export</h4>
<ul class="m-ul">
<li><span class="m-strong">"Invalid file format"</span>, <span class="m-strong">"The file does not contain a valid game"</span> or <span class="m-strong">"This game file version is not supported."</span> — the selected file is not a Familiada game file or it has been damaged. Export the game again and import the new file (<a class="m-ref" href="#r6-7">chapter 6.7</a>).</li>
<li><span class="m-strong">"Another operation is in progress. Try again shortly."</span> — wait for the previous action to finish.</li>
<li><span class="m-strong">"A game with an open poll can't be exported."</span> — stop, count or abort the poll, and then export the game.</li>
<li><span class="m-strong">The imported game is a draft</span> — a game with an open or stopped poll goes into the file without votes, so after import it is a draft. A closed poll keeps its result (<a class="m-ref" href="#r6-7">chapter 6.7</a>).</li>
<li><span class="m-strong">Importing questions from a text file replaced the game's content</span> — this is how this import works; before doing it, it's a good idea to export the game to a file (<a class="m-ref" href="#r7-7">chapter 7.7</a>).</li>
</ul>
<p class="m-p"><span class="m-strong">The list of games or bases doesn't load</span> ("Failed to load your games. Check your connection and refresh the page.") — check your internet connection and refresh the page.</p>
<p class="m-p"><span class="m-strong">Messages "Not available on a phone", "A larger screen is required" or "Window too narrow"</span> — this page needs a larger screen. Open it on a computer or tablet, widen the browser window or leave split-screen view.</p>

<h3 class="m-h2" id="r19-3">19.3 Poll and voting problems</h3>
<p class="m-p"><span class="m-strong">I didn't get a poll invitation</span></p>
<ul class="m-ul">
<li>Check your spam folder.</li>
<li>If you have an account, open <span class="m-btn"><i class="ico" data-icon="bell"></i>Tasks</span>. Poll invitations are visible there regardless of email messages — even if you turn off email notifications in <span class="m-page">Account settings</span> (<a class="m-ref" href="#r15-4">chapter 15.4</a>).</li>
<li>The poll author can resend the invitation only after the indicated time has passed — the service shows them in how many hours it will be possible.</li>
</ul>
<p class="m-p"><span class="m-strong">I can't vote</span></p>
<ul class="m-ul">
<li><span class="m-strong">"Log in to vote."</span> or <span class="m-strong">"This invitation is for another account."</span> — sign in to the account the invitation was sent to.</li>
<li><span class="m-strong">"The poll is stopped"</span> — the author has paused voting. The link will work again when they resume the poll.</li>
<li><span class="m-strong">"The poll has been closed"</span>, <span class="m-strong">"This link has expired"</span> or <span class="m-strong">"This invitation has expired"</span> — voting has ended and you can no longer cast a vote.</li>
<li><span class="m-strong">"You have already voted in this poll"</span> — each participant votes once.</li>
<li>An answer in a standard poll can have at most 17 characters; a longer one will be shortened.</li>
</ul>
<p class="m-p"><span class="m-strong">I can't count the votes or close the poll</span></p>
<ul class="m-ul">
<li><span class="m-strong">"Votes can be counted from … complete polls"</span> — collect more votes.</li>
<li><span class="m-strong">"Question #…: to approve, at least 3 answers…"</span> — in this question too few answers have reached the required share of votes. Collect more votes or work on the answers (<a class="m-ref" href="#r15-6">chapter 15.6</a>).</li>
<li><span class="m-strong">"The number of votes changed — leave counting and enter again."</span> — new votes came in during counting. Click <span class="m-btn">Leave counting</span> and start again.</li>
</ul>
<p class="m-p"><span class="m-strong">I can't see the poll results</span> — the results appear in the game only after the votes are counted. The game then has the <span class="m-code">READY</span> status, and you can view the results in the game preview (<a class="m-ref" href="#r15-7">chapter 15.7</a>).</p>

<h3 class="m-h2" id="r19-4">19.4 Problems during the game</h3>
<p class="m-p"><span class="m-strong">I can't move on after connecting the devices</span> — the button for moving on becomes active only when all required devices are connected. If you don't use a host tablet or you play with a physical buzzer, tick <span class="m-btn">No host tablet</span> or <span class="m-btn">Physical buzzer</span>. If the Display is the sound source, first unlock the sound on it (<a class="m-ref" href="#r17-1">chapter 17.1</a>).</p>

<p class="m-p"><span class="m-strong">The button for moving on stays inactive for a long time</span> (for example <span class="m-btn">Start</span> after the intro)</p>
<p class="m-p">The Control panel waits until the Display shows the change on the board. When the Display window is minimized or is a tab hidden behind the Control panel, the browser slows down or pauses its animations, and the panel waits longer.</p>
<ul class="m-ul">
<li>Open the Display in a separate window, move it to the TV or second monitor and turn on <span class="m-btn"><i class="ico" data-icon="fullscreen-enter"></i>Fullscreen</span>.</li>
<li>Don't leave the Display in the background for the whole game.</li>
</ul>

<p class="m-p"><span class="m-strong">The game is waiting for sound from the Display</span></p>
<p class="m-p">When the Display is the sound source, the browser allows sound to play only after a click on that device. On the Display you have to click <span class="m-btn"><i class="ico" data-icon="speaker-on"></i>Unlock sound</span> every time it is opened and also when the browser mutes the page by itself — for example after the TV goes to sleep. Until then, the Control panel pauses the game.</p>
<ul class="m-ul">
<li>Unlock the sound on the Display before the game starts. On a TV you can use the OK or Enter button on the remote.</li>
<li>Don't reload the Display during the game.</li>
<li>If the Display and the Control panel run on the same computer, it is more convenient to choose "Control panel" as the sound source (<a class="m-ref" href="#r16-4">chapter 16.4</a>).</li>
</ul>

<p class="m-p"><span class="m-strong">The game paused with a message about a missing device</span> — see <a class="m-ref" href="#r19-5">chapter 19.5</a>.</p>

<p class="m-p"><span class="m-strong">The game ended after changing the settings</span></p>
<p class="m-p">When you open <span class="m-page">Game settings</span> during a game, you will see the "Game in progress" window. Choosing <span class="m-btn">End game and open settings</span> ends the current game and disconnects the devices.</p>
<ul class="m-ul">
<li>Change the settings before the game starts — for example with the <span class="m-btn"><i class="ico" data-icon="settings"></i>Change settings</span> button in the Summary (<a class="m-ref" href="#r17-2">chapter 17.2</a>) — or after it ends.</li>
<li>If you open the settings by accident, click <span class="m-btn">Go back</span> — the game goes on.</li>
<li>Going to the guide and returning to the Control panel does not interrupt the game.</li>
</ul>

<p class="m-p"><span class="m-strong">The game was not finished</span></p>
<p class="m-p">If you close the Control panel during a game, the game session stays open: the game cannot be changed, and when you enter its settings, the "Game in progress" window appears. The lock expires by itself after an hour without activity. Finish the game on the end screen — after <span class="m-btn">Finish game</span>, click <span class="m-btn">Back to my games</span> (<a class="m-ref" href="#r17-5">chapter 17.5</a>).</p>

<p class="m-p"><span class="m-strong">Board or sound delays in test mode</span></p>
<p class="m-p"><span class="m-btn">Test mode</span> shows the Display, the Host and the Buzzer in one window with the Control panel. All screens then run on one computer, and frequent tab switching slows the browser down even more. Test mode is for rehearsal; for a real game use separate devices (<a class="m-ref" href="#r17-1">chapter 17.1</a>).</p>

<p class="m-p"><span class="m-strong">Other situations</span></p>
<ul class="m-ul">
<li><span class="m-strong">"No more questions available for further rounds (all used)."</span> — the round questions have run out. The game moves to the end; the mechanics are described in <a class="m-ref" href="#r3">chapter 3</a>, and the threshold and number-of-questions settings in <a class="m-ref" href="#r16-6">chapter 16.6</a>.</li>
<li><span class="m-strong">"The finale needs 5 questions."</span> — the pool ran short of questions for the finale. Add questions to the game or choose the 5 finale questions manually (<a class="m-ref" href="#r16-5">chapter 16.5</a>).</li>
<li><span class="m-strong">No sound can be heard</span> — check that the sound isn't muted with the <kbd class="m-kbd">M</kbd> key or the speaker button in the Control panel, and check the volume of the TV or speakers.</li>
</ul>

<h3 class="m-h2" id="r19-5">19.5 Device problems</h3>
<p class="m-p"><span class="m-strong">I can't connect a device</span></p>
<ul class="m-ul">
<li><span class="m-strong">"The code is invalid or has expired."</span> — check the 6-digit code next to the right device in the Control panel and enter it again in <span class="m-btn"><i class="ico" data-icon="phone"></i>Connect device</span>.</li>
<li><span class="m-strong">"This is not a display code."</span> — on a TV you can only connect the Display or a poll's QR Display. Connect the Host and the Buzzer on a phone or tablet.</li>
<li><span class="m-strong">"The Control session expired. Ask the owner for a new link."</span> — device links expire after an hour without activity. Ask the person running the game for a new link or code.</li>
<li><span class="m-strong">"Camera access denied."</span> when scanning a QR code — allow the browser to use the camera or scan the code with the system camera.</li>
</ul>

<p class="m-p"><span class="m-strong">The game pauses from time to time, and a device shows as disconnected</span></p>
<p class="m-p">When a required device loses its connection, the Control panel shows the "Connection lost" window with the device name and blocks game actions until it comes back. The countdown keeps running. The most common cause is the screen of the phone with the buzzer or of the host tablet turning off, or switching to another app.</p>
<ul class="m-ul">
<li>Keep the device screen on throughout the game; ideally plug it into a charger.</li>
<li>Extend the automatic screen lock time in the phone or tablet settings.</li>
<li>Don't switch to other apps during the game.</li>
<li>If you use a physical buzzer or the host doesn't use a tablet, tick <span class="m-btn">Physical buzzer</span> or <span class="m-btn">No host tablet</span> in the Control panel — such a device will then not be required.</li>
</ul>
<p class="m-p">After you return to the page, the device reconnects by itself within a few seconds — meanwhile it shows the message "Checking the device connection". You don't need to refresh the page. If the connection doesn't come back, check the internet on the device and in the Control panel, and as a last resort connect the device again with the buttons in the top bar of the Control panel. When the Display is the sound source, unlock the sound on it again after it reconnects (<a class="m-ref" href="#r19-4">chapter 19.4</a>).</p>

<p class="m-p"><span class="m-strong">Message "This device is waiting"</span></p>
<p class="m-p">The same game device — the Display, the host screen or the Buzzer — is already open somewhere else. Only one window of a given device can work at a time.</p>
<ul class="m-ul">
<li><span class="m-strong">QR code scanned several times on the same phone</span> — the newest tab works right away, and the older ones show the waiting message. Go back to the same tab instead of scanning the code again, and close the unneeded tabs.</li>
<li><span class="m-strong">Device open on another phone or in another browser</span> — close that tab or wait a dozen or so seconds until it disconnects. This screen will then switch on automatically.</li>
</ul>

<p class="m-p"><span class="m-strong">No picture or the wrong view</span></p>
<ul class="m-ul">
<li><span class="m-strong">The Display doesn't fit on the screen or browser bars are visible</span> — click <span class="m-btn"><i class="ico" data-icon="fullscreen-enter"></i>Fullscreen</span>. On a TV, the browser may allow this only after you press a button on the remote.</li>
<li><span class="m-strong">"Turn your phone sideways to use the buzzer."</span> — the Buzzer works with the phone held horizontally.</li>
<li><span class="m-strong">The host screen doesn't show the question</span> — the content is covered. Swipe across the screen as the hint shows to reveal it (<a class="m-ref" href="#r17-1">chapter 17.1</a>).</li>
</ul>

<p class="m-p"><span class="m-strong">No sound</span></p>
<ul class="m-ul">
<li>Sound plays only on the device selected as the sound source: in the Control panel or on the Display (<a class="m-ref" href="#r16-4">chapter 16.4</a>).</li>
<li>With the "Display" source, click <span class="m-btn"><i class="ico" data-icon="speaker-on"></i>Unlock sound</span> on it.</li>
<li>With an HDMI cable connection, the "Control panel" source is usually enough, together with selecting the TV as the sound output in the computer settings.</li>
<li>Check the mute setting in the Control panel (<kbd class="m-kbd">M</kbd>) and the volume of the TV or speakers.</li>
</ul>

<h3 class="m-h2" id="r19-6">19.6 Contacting support</h3>
<p class="m-p">If the problem keeps coming back or you can't find a solution, write to us. You will find the <span class="m-btn">Contact</span> button in the footer of the service's pages, including the <span class="m-page">My games</span> page, the <span class="m-page">Control panel</span> and this guide. It is not on the game device screens (the Display, the host screen, the Buzzer).</p>
<ol class="m-ol">
<li>Click <span class="m-btn">Contact</span>. The <span class="m-page">Contact us</span> window opens.</li>
<li>Enter <span class="m-strong">Your e-mail</span> — we will reply to this address. When you are signed in, the address is filled in automatically.</li>
<li>Enter the <span class="m-strong">Subject</span> and the <span class="m-strong">Message</span> (at least 5 characters).</li>
<li>Optionally add <span class="m-strong">Attachments</span>, for example screenshots: at most 5 files, each up to 5 MB.</li>
<li>Click <span class="m-btn"><i class="ico" data-icon="envelope-out"></i>Send</span>.</li>
</ol>
<p class="m-p">After sending, you will see the <span class="m-strong">Ticket number</span>, which you will also receive in the confirmation message. You can send a new report once every 24 hours. To add something to an existing report, enter its number in the <span class="m-strong">Ticket number (optional)</span> field — the subject field will then disappear, and the message will be attached to that report.</p>
<p class="m-p"><span class="m-strong">What to write to help us find the cause quickly:</span></p>
<ul class="m-ul">
<li>on which page or in which window the problem occurred and what you did, step by step;</li>
<li>what you expected and what happened instead;</li>
<li>the exact text of the error message (ideally a screenshot);</li>
<li>on what device and in what browser it happened — during a game, also which game devices were connected and on what (computer, TV, phone);</li>
<li>whether the problem happens every time and when it first occurred.</li>
</ul>
<div class="m-note"><p class="m-p">Don't include your password in the message — we never need it.</p></div>

<h2 class="m-ch" id="r20">20. Glossary</h2>
<p class="m-p">Short explanations of the names used in the TV show and in the service. The entries are arranged in three groups; the link leads to a fuller description.</p>

<h3 class="m-h2" id="r20-1">20.1 Game show terms</h3>
<ul class="m-ul">
<li><span class="m-strong">Bank</span> — the total points for answers revealed in the current round. When the round is settled, it goes to one team, taking the multiplier into account. <a class="m-ref" href="#r3">Chapter 3</a></li>
<li><span class="m-strong">Strike (X, miss)</span> — an answer that is not on the board, or no answer in time. Three strikes of the team in play give the opponents a chance to steal the points. <a class="m-ref" href="#r3">Chapter 3</a></li>
<li><span class="m-strong">Finale target</span> — the number of points the finalists must score together to win the main prize. <a class="m-ref" href="#r4">Chapter 4</a>, <a class="m-ref" href="#r16-6">chapter 16.6</a></li>
<li><span class="m-strong">Game target</span> — see <span class="m-strong">Threshold</span>.</li>
<li><span class="m-strong">Extra round</span> — on the TV show, an additional round when no team has reached the threshold after the planned rounds. In the service, further questions are ordinary rounds. <a class="m-ref" href="#r3">Chapter 3</a></li>
<li><span class="m-strong">Finale</span> — the last stage of the game, in which two players from the winning team answer five questions against the clock. <a class="m-ref" href="#r4">Chapter 4</a></li>
<li><span class="m-strong">Steal</span> — see <span class="m-strong">Stealing the points</span>.</li>
<li><span class="m-strong">Prize multiplier</span> — a service setting used to calculate the prize after the finale. <a class="m-ref" href="#r4">Chapter 4</a>, <a class="m-ref" href="#r16-6">chapter 16.6</a></li>
<li><span class="m-strong">Round multiplier</span> — the number by which the bank won in a given round is multiplied. In the service you can set your own sequence of multipliers. <a class="m-ref" href="#r3">Chapter 3</a>, <a class="m-ref" href="#r16-6">chapter 16.6</a></li>
<li><span class="m-strong">Main prize</span> — the prize for reaching the finale target; in the service you set its amount yourself. <a class="m-ref" href="#r4">Chapter 4</a></li>
<li><span class="m-strong">Passing the question</span> — the decision of the team that won the duel to let the opponents answer instead. <a class="m-ref" href="#r3">Chapter 3</a></li>
<li><span class="m-strong">Revealing</span> — showing answers and their points on the board. <a class="m-ref" href="#r17-3">Chapter 17.3</a></li>
<li><span class="m-strong">Duel</span> — the start of a round: representatives of both teams answer the same question, and the result decides which team takes over the game. <a class="m-ref" href="#r3">Chapter 3</a></li>
<li><span class="m-strong">Repeat</span> — in the finale, the second player's answer that is identical to the first player's; the player must give a different one. <a class="m-ref" href="#r4">Chapter 4</a></li>
<li><span class="m-strong">Threshold</span> — the team's total points after which the game goes to the finale or to the end. In the service settings it is called "Game target". <a class="m-ref" href="#r3">Chapter 3</a>, <a class="m-ref" href="#r16-6">chapter 16.6</a></li>
<li><span class="m-strong">Stealing the points</span> — after three strikes of the team in play, the opponents get one chance; if they get it right, they take the whole round bank. <a class="m-ref" href="#r3">Chapter 3</a></li>
<li><span class="m-strong">Round</span> — playing one question: the duel, the team answering and settling the bank. <a class="m-ref" href="#r3">Chapter 3</a></li>
<li><span class="m-strong">Board</span> — the list of answers from the survey, ordered by popularity, with points. <a class="m-ref" href="#r2">Chapter 2</a></li>
</ul>

<h3 class="m-h2" id="r20-2">20.2 Poll and collaboration terms</h3>
<ul class="m-ul">
<li><span class="m-strong">Standard poll</span> — a game type in which you enter only the questions, and the voters provide the answers. <a class="m-ref" href="#r7-1">Chapter 7.1</a>, <a class="m-ref" href="#r15">chapter 15</a></li>
<li><span class="m-strong">Ready</span> — the status of a game that can be played; a poll game gets it after the votes are counted. <a class="m-ref" href="#r6-2">Chapter 6.2</a></li>
<li><span class="m-strong">Prepared game</span> — a game type in which you enter the questions, answers and points yourself, without a poll. <a class="m-ref" href="#r7-1">Chapter 7.1</a></li>
<li><span class="m-strong">Community Games</span> — a catalog of games shared by other users, which you can add to your library and play. <a class="m-ref" href="#r13">Chapter 13</a></li>
<li><span class="m-strong">Copy</span> — an independent duplicate of a game or logo, duplicated for yourself or sent to a friend; changes in the copy don't change the original. <a class="m-ref" href="#r6-6">Chapter 6.6</a>, <a class="m-ref" href="#r11-1">chapter 11.1</a></li>
<li><span class="m-strong">Voting QR code</span> — a code that voters scan with their phone to go to the poll without an invitation. <a class="m-ref" href="#r15-2">Chapter 15.2</a></li>
<li><span class="m-strong">Open</span> — the status of a game with ongoing voting. <a class="m-ref" href="#r6-2">Chapter 6.2</a></li>
<li><span class="m-strong">Counting</span> — closing the poll: the collected votes turn into the game's answers and points. <a class="m-ref" href="#r15-6">Chapter 15.6</a></li>
<li><span class="m-strong">Access level</span> — the scope of permissions to a shared question base: read-only or with editing. <a class="m-ref" href="#r12-4">Chapter 12.4</a></li>
<li><span class="m-strong">Points</span> — a game type in which you enter the questions and answers, and the points come from voting on them. <a class="m-ref" href="#r7-1">Chapter 7.1</a></li>
<li><span class="m-strong">Subscriber</span> — a person who has accepted your subscription invitation and can receive poll invitations from you; they don't need an account. <a class="m-ref" href="#r14-1">Chapter 14.1</a></li>
<li><span class="m-strong">Draft</span> — the status of a game being prepared or one whose poll has not been started yet. <a class="m-ref" href="#r6-2">Chapter 6.2</a></li>
<li><span class="m-strong">Shared base</span> — a question base you work on together with friends. <a class="m-ref" href="#r12-1">Chapter 12.1</a></li>
<li><span class="m-strong">Task</span> — a request from another user that you will find in <span class="m-page">Tasks</span>, for example an invitation to vote in a poll, to a shared base or to connect a device. <a class="m-ref" href="#r15-4">Chapter 15.4</a></li>
<li><span class="m-strong">Invitation</span> — a request to become friends, to subscribe, to take part in a poll or for access to a base; the recipient can accept or decline it. <a class="m-ref" href="#r10-2">Chapter 10.2</a>, <a class="m-ref" href="#r14-2">chapter 14.2</a>, <a class="m-ref" href="#r15-4">chapter 15.4</a></li>
<li><span class="m-strong">Stopped</span> — the status of a poll in which voting has been paused; the collected votes stay, and the poll can be resumed or counted. <a class="m-ref" href="#r15-5">Chapter 15.5</a></li>
<li><span class="m-strong">Friend</span> — a user with an account with whom you have both confirmed the friendship; you can send them copies of games and logos and share question bases with them. <a class="m-ref" href="#r10-1">Chapter 10.1</a></li>
</ul>

<h3 class="m-h2" id="r20-3">20.3 Game and device terms</h3>
<ul class="m-ul">
<li><span class="m-strong">Question base</span> — your collection of questions and answers organized in folders, from which you can create games. <a class="m-ref" href="#r9-1">Chapter 9.1</a></li>
<li><span class="m-strong">Game editor</span> — the page where you enter the game's questions and answers. <a class="m-ref" href="#r7-2">Chapter 7.2</a></li>
<li><span class="m-strong">Host screen</span> — a game device (phone or tablet) that shows the host the question and the answers; in the Control panel it is called "Host". It is optional. <a class="m-ref" href="#r17-1">Chapter 17.1</a></li>
<li><span class="m-strong">Folder</span> — a place in the question base where you group questions. <a class="m-ref" href="#r9-4">Chapter 9.4</a></li>
<li><span class="m-strong">Device code</span> — a 6-digit code from the Control panel that you enter on the device in <span class="m-page">Connect device</span>. <a class="m-ref" href="#r17-1">Chapter 17.1</a></li>
<li><span class="m-strong">Guest account</span> — an account without an email address, stored in only one browser; it can be turned into a registered account. <a class="m-ref" href="#r5-4">Chapter 5.4</a></li>
<li><span class="m-strong">Game logo</span> — a caption or image you prepared that is shown on the Display, among other times at the start and end of the game. <a class="m-ref" href="#r8-1">Chapter 8.1</a></li>
<li><span class="m-strong">Theme</span> — the visual style of the board on the Display. <a class="m-ref" href="#r16-3">Chapter 16.3</a></li>
<li><span class="m-strong">Control panel</span> — the page from which the operator runs the game and connects devices. <a class="m-ref" href="#r17">Chapter 17</a></li>
<li><span class="m-strong">Connect device</span> — the page where you enter a device code or scan a QR code to open the Display, the host screen or the Buzzer. <a class="m-ref" href="#r17-1">Chapter 17.1</a></li>
<li><span class="m-strong">Buzzer</span> — a game device (phone) with the buttons of both teams, used in the duel. <a class="m-ref" href="#r17-1">Chapter 17.1</a></li>
<li><span class="m-strong">Physical buzzer</span> — an option for a game with a real buzzer: the operator indicates which team pressed first. <a class="m-ref" href="#r17-1">Chapter 17.1</a></li>
<li><span class="m-strong">Tag</span> — a label assigned to questions in the base that makes them easier to find. <a class="m-ref" href="#r9-4">Chapter 9.4</a></li>
<li><span class="m-strong">Test mode</span> — a game rehearsal on one computer: the Display, the Host and the Buzzer appear in the Control panel window. <a class="m-ref" href="#r17-1">Chapter 17.1</a></li>
<li><span class="m-strong">Game settings</span> — the page with teams, appearance, sound, question selection and additional game options. <a class="m-ref" href="#r16">Chapter 16</a></li>
<li><span class="m-strong">Display</span> — the game device that shows the board to the audience, ideally on a TV or projector. It is always required. <a class="m-ref" href="#r17-1">Chapter 17.1</a></li>
<li><span class="m-strong">QR Display</span> — a screen with the poll's voting QR code that can be shown on a big screen. <a class="m-ref" href="#r15-2">Chapter 15.2</a></li>
<li><span class="m-strong">Sound source</span> — the device on which the game sounds play: the Control panel or the Display. <a class="m-ref" href="#r16-4">Chapter 16.4</a></li>
</ul>
`,
};
