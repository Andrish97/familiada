const en = {
  meta: {
    lang: "en",
    label: "English",
    flag: "🇬🇧",
  },
  common: {
    languageLabel: "Language",
    backToLogin: "Back to login",
    goToPanel: "Go to panel",
    back: "Back",
    next: "Next",
    yes: "Yes",
    no: "No",
    open: "Open",
    copy: "Copy",
    done: "Done",
    modal: {
      confirmTitle: "Confirm",
      confirmText: "Are you sure?",
      confirmOk: "Yes",
      confirmCancel: "No",
      alertTitle: "Information",
      alertOk: "OK",
      promptTitle: "Enter",
      promptText: "Provide a value:",
      promptOk: "Save",
      promptCancel: "Cancel",
      closeLabel: "Close",
    },
    fullscreen: "Fullscreen",
    a2hsTitle: "Fullscreen on iPhone",
    a2hsHost:
      "Safari can't force true fullscreen. Use <b>Share</b> → <b>Add to Home Screen</b>, then launch it like an app.",
    a2hsBuzzer:
      "Safari can't force true fullscreen. Use <b>Share</b> → <b>Add to Home Screen</b>.",
    a2hsOk: "OK",
    fullscreenUnavailable: "Fullscreen API is not available.",
  },
  deviceGuard: {
    title: "Not available on mobile",
    message: "This page works only on a desktop computer.",
    back: "Go back",
  },
  auth: {
    emailNotConfirmed: "Confirm your email (link in inbox).",
    invalidCredentials: "Wrong email or password.",
    unknownEmail: "I don't know this email or the account doesn't exist.",
    unknownUsername: "I don't know this username.",
    loginFailed: "Login failed.",
    tooManyRequests: "Too many requests. Try again later.",
    linkInvalidOrExpired: "The link is invalid or expired.",
    passwordMustDiffer: "New password must be different from the old password.",
    passwordTooShort: "Password is too short.",
    userAlreadyRegistered: "This email is already registered.",
    confirmEmailFirst: "Please confirm your email first.",
    enterUsername: "Enter a username.",
    usernameMin: "Username: minimum 3 characters.",
    usernameMax: "Username: maximum 20 characters.",
    usernameChars: "Allowed characters: letters, digits, _ . -",
    passwordHintMin: "min. 8 characters",
    passwordHintLower: "lowercase letter",
    passwordHintUpper: "uppercase letter",
    passwordHintNumber: "number",
    passwordHintSpecial: "special character",
    passwordRules: "Password must include: {hints}.",
  },
  index: {
    title: "Familiada — login",
    subtitle: "Game creation and hosting panel",
    statusChecking: "Checking session…",
    statusLoggedOut: "Not logged in.",
    btnLogin: "Log in",
    btnRegister: "Register",
    btnToggleRegister: "Create account",
    btnToggleLogin: "I have an account",
    placeholderLogin: "Email or username",
    placeholderEmail: "Email",
    placeholderPassword: "Password",
    placeholderPasswordRepeat: "Repeat password",
    btnForgot: "Forgot password",
    setupTitle: "First login",
    setupPrompt: "Set your username",
    setupSub: "It will be visible in the panel and in invitations.",
    placeholderUsername: "Username",
    btnUsernameSave: "Save name",
    errMissingLogin: "Enter email/username and password.",
    errPendingEmailChange: "You changed your email. Log in with the new address.",
    errInvalidEmail: "Enter a valid email.",
    errPasswordMismatch: "Passwords do not match.",
    statusRegistering: "Registering…",
    statusCheckEmail: "Check your email (activation link).",
    statusLoggingIn: "Logging in…",
    statusError: "Error.",
    errResetMissingLogin: "Enter email or username to reset.",
    statusResetSending: "Sending reset link…",
    statusResetSent: "Password reset link sent.",
    statusSavingUsername: "Saving username…",
    errUsernameTaken: "This username is already taken.",
    errNoSession: "No active session.",
    resetCooldown: "You can resend in {time}.",
    errResetCooldown: "The link was already sent. Try again in {time}.",
  },
  confirm: {
    title: "Familiada — account confirmation",
    subtitle: "Account confirmation",
    statusChecking: "Checking link…",
    hint: "If the link expired, log in again or request a password reset.",
    sessionInfo: "You have an active session — it doesn't block link confirmation.",
    linkAlreadyUsed: "This link has already been used.",
    linkAlreadyUsedHint: "If this is an email change, confirm the second link from the other inbox.",
    linkInvalid: "The link is invalid or expired.",
    firstLinkConfirmed: "First link confirmed.",
    firstLinkConfirmedHint: "Confirm the second link from the other inbox (it may be on another device). Only then you can log in to the new email.",
    checkOtherEmail: "Check the other email address to finish the change.",
    activating: "Activating account…",
    done: "Done! Account confirmed.",
    savedNoSession: "Confirmation saved. Please log in again.",
    failed: "Failed to confirm account.",
    missingCode: "No code in the link.",
    missingCodeHint: "The link looks incomplete or already used.",
    confirmedNoSession: "Account confirmed, but no session found.",
  },
  reset: {
    title: "Familiada — password reset",
    subtitle: "Set a new password",
    statusChecking: "Checking link…",
    statusVerifying: "Verifying reset link…",
    missingCode: "No code in the link.",
    missingCodeHint: "The link looks incomplete or expired.",
    startFailed: "Could not start reset.",
    noSession: "No session after link verification.",
    linkOk: "Link OK. Set a new password.",
    verifyFailed: "Could not verify the link.",
    errPasswordMismatch: "Passwords do not match.",
    statusSaving: "Saving new password…",
    statusSaved: "Password changed. Returning to login…",
    saveFailed: "Password save error.",
    hint: "After saving the password you will return to login.",
    placeholderNewPassword: "New password",
    placeholderRepeatPassword: "Repeat new password",
    btnSavePassword: "Save password",
  },
  account: {
    title: "Familiada — account",
    pageTitle: "Familiada — account settings",
    backToGames: "← My games",
    headerTitle: "Account settings",
    headerHint: "Manage your profile, email, and security.",
    statusLoading: "Loading profile…",
    usernameTitle: "Username",
    usernameHint: "Visible to subscribers and in the panel.",
    usernamePlaceholder: "Username",
    usernameSave: "Save name",
    emailTitle: "Email",
    emailHint: "Change your login address. After changing, check both the current and new inbox to confirm.",
    emailPlaceholder: "New email",
    emailSave: "Change email",
    emailPostHint: "Email change requires confirming links in both inboxes. Until then, you can keep logging in with your current email.",
    emailNoAccessHint: "No access to your current email? Export important data (games, bases, logos), delete the account, create a new one with the correct email, then import it back.",
    emailPendingTitle: "Email change in progress",
    emailPendingText: "New email: {email}. Finish the change by confirming the links (sent to both current and new addresses).",
    emailResend: "Resend",
    emailCancel: "Cancel change",
    passwordTitle: "Password",
    passwordHint: "Minimum 8 characters, lowercase/uppercase letters, number, and special character.",
    passwordPlaceholder: "New password",
    passwordRepeatPlaceholder: "Repeat new password",
    passwordSave: "Change password",
    deleteTitle: "Delete account",
    deleteHint: "This operation is irreversible. Enter your password to confirm.",
    deletePlaceholder: "Password",
    deleteButton: "Delete account and data",
    statusLoaded: "Profile loaded.",
    statusUsernameSaved: "Username saved.",
    statusSavingEmail: "Saving email address…",
    statusEmailSaved: "Confirmation links were sent. Check both your current and new inbox to finish the change.",
    statusEmailPending: "Email change is in progress.",
    statusEmailResending: "Resending links…",
    statusEmailResent: "Resent. Check your inboxes.",
    statusEmailCancelling: "Cancelling…",
    statusEmailCancelled: "Email change cancelled.",
    statusPasswordSaved: "Password changed.",
    statusDeleting: "Deleting account…",
    statusError: "Error.",
    errInvalidEmail: "Enter a valid email.",
    errEmailPending: "An email change is already in progress. Finish it or cancel it first.",
    errNoPendingEmail: "No email change in progress.",
    cooldown: "You can try again in {time}.",
    errCooldown: "Too soon. Try again in {time}.",
    errPasswordMismatch: "Passwords do not match.",
    errDeletePasswordMissing: "Enter your password to confirm.",
    errInvalidPassword: "Invalid password.",
    errDeleteFailed: "Failed to delete account.",
  },
  control: {
    title: "Familiada — Control panel",
    statusLabel: "Device status",
    deviceDisplay: "Display",
    deviceHost: "Host",
    deviceBuzzer: "Buzzer",
    backToGames: "← My games",
    logout: "Log out",
    gameLabel: "Control panel",
    alertOk: "OK",
    qrModalTitle: "Device",
    qrModalImgAlt: "QR code",
    qrModalLinkAria: "Device link",
    colorTitle: "Color",
    colorPreviewAria: "Color preview",
    colorHexLabel: "HEX",
    colorHexFormat: "Format:",
    colorHint: "Changes are sent and shown live.",
    tabDevices: "Devices",
    tabSetup: "Questions and settings",
    tabSetupShort: "Settings",
    tabRounds: "Rounds",
    tabFinal: "Final",
    panelDevices: "Devices",
    stepDisplay: "Display",
    lastSeen: "Last seen:",
    blackScreen: "Black screen",
    qrDisplayAlt: "QR for display",
    stepHostBuzzer: "Host and buzzer",
    qrOnDisplay: "QR on display",
    qrHostAlt: "Host QR",
    hostLinkAria: "Host link",
    qrBuzzerAlt: "Buzzer QR",
    buzzerLinkAria: "Buzzer link",
    stepAudio: "Sound",
    audioUnlockTitle: "Unlock sound",
    audioUnlockHint: "Click once so the browser allows sound playback.",
    audioUnlockBtn: "🔊 Unlock",
    audioBlocked: "BLOCKED",
    devicesFinish: "Done — continue",
    panelSetup: "Questions and settings",
    stepTeamNames: "Team names",
    teamHint: "Enter team names here, choose colors, and adjust extra settings.",
    teamALabel: "Team A",
    teamAColorAria: "Team A color",
    teamBLabel: "Team B",
    teamBColorAria: "Team B color",
    teamADefault: "Team A",
    teamBDefault: "Team B",
    bgColorLabel: "Display background color",
    bgColorAria: "Display background color",
    bgColorHint: "This color affects only the display.",
    resetColors: "Reset colors",
    extraSettingsToggle: "Extra settings",
    extraSettingsTitle: "Extra settings",
    roundMultipliers: "Round multipliers",
    roundMultipliersHint:
      "Enter comma-separated values, e.g. 1,1,1,2,3. If there are more rounds, the last value is reused.",
    gameTarget: "Game target",
    finalTarget: "Final target",
    gameEndMode: "Game ending",
    showLogo: "Show logo",
    showPoints: "Show points",
    showMoney: "Show amount (after final)",
    advancedReset: "Restore defaults",
    stepFinal: "Final",
    playFinal: "Play the final?",
    finalQuestions: "Questions",
    finalBadge: "Final:",
    finalPoolHint: "Questions for gameplay (pool).",
    finalListHint: "Final questions (max 5).",
    finalOnlyHint: "Questions confirmed. Click “Edit” to change.",
    refresh: "Refresh",
    confirm: "Confirm",
    edit: "Edit",
    panelRounds: "Rounds",
    roundsReadyTitle: "Game ready",
    roundsReadyName: "Prepare the game",
    roundsReadyHint: "Make sure Display, Host, and Buzzer are connected. Then start the game screen.",
    roundsReadyBtn: "Game ready",
    roundsIntroTitle: "Game intro",
    roundsIntroName: "Start the game",
    roundsIntroHint:
      "The display will show the show logo and play the intro. After it ends you will go to the first round.",
    roundsIntroBtn: "Start the game",
    roundsStartTitle: "Start round",
    roundsStartName: "Empty board + question",
    roundsStartHint: "The display shows an empty round board and the host receives the question.",
    roundsStartBtn: "Start round",
    roundsDuelTitle: "Confirm buzzer",
    roundsDuelName: "Buzzer duel",
    roundsDuelHint:
      "The buzzer is active. When a team presses it, choose whether to confirm or retry.",
    roundsBuzzAcceptA: "Confirm Team A",
    roundsBuzzAcceptB: "Confirm Team B",
    roundsBuzzRetry: "Retry press",
    roundsPlayTitle: "Round",
    roundsPlayName: "Gameplay",
    roundsPlayHint:
      "Press the correct answer, or X (strike). You can also start a 3s countdown (time=X). After the duel, you can pass the question to the other team. In full gameplay, after three X the steal starts.",
    roundsPassQuestion: "Pass the question",
    roundsAnswers: "Answers",
    roundsAddX: "X (strike)",
    roundsStartTimer3: "Start 3s countdown",
    roundsEndRound: "End round",
    roundsGameEndTitle: "End of game",
    roundsGameEndName: "End game",
    roundsGameEndHint:
      "That was the last round. The display will show the show logo or the winning team's points (if enabled).",
    roundsGameEndBtn: "End game",
    panelFinal: "Final",
    finalStartTitle: "Final start",
    finalStartName: "Start final",
    finalStartHint:
      "Final sound, hide old board, show final board. Host receives the questions.",
    finalStartBtn: "Start final",
    finalP1EntryTitle: "Round 1 — entry",
    finalP1EntryName: "Player 1 answers (15s)",
    finalP1EntryHint:
      "The operator enters the player's answers. Use Enter to go to the next question or arrow keys to switch. Timer starts after pressing the button. You can start/stop it with Shift + Ctrl (Cmd on Mac).",
    finalStartTimer15: "Start countdown (15s)",
    finalP1MapQ1Title: "Round 1 — mapping (Q1)",
    finalP1MapQ2Title: "Round 1 — mapping (Q2)",
    finalP1MapQ3Title: "Round 1 — mapping (Q3)",
    finalP1MapQ4Title: "Round 1 — mapping (Q4)",
    finalP1MapQ5Title: "Round 1 — mapping (Q5)",
    finalMapHint:
      "Pick an answer from the list if it fits; otherwise the player's answer is 0 pts. If nothing was entered, it's no answer. You can reveal answers and points.",
    finalP2StartTitle: "Round 2 — start",
    finalP2StartName: "Start round 2",
    finalP2StartHint:
      "Round sound, player 1 answers are hidden; you can play the repeat sound here.",
    finalP2StartBtn: "Start round 2",
    finalRepeatSound: "Repeat sound",
    finalP2EntryTitle: "Round 2 — entry",
    finalP2EntryName: "Player 2 answers (20s)",
    finalP2EntryHint:
      "The operator enters the player's answers. Enter/arrow keys to move; Enter + Shift marks a repeat. Timer starts after pressing the button; you can see player 1's answers. Use Shift + Ctrl (Cmd) to start/stop.",
    finalStartTimer20: "Start countdown (20s)",
    finalP2MapQ1Title: "Round 2 — mapping (Q1)",
    finalP2MapQ2Title: "Round 2 — mapping (Q2)",
    finalP2MapQ3Title: "Round 2 — mapping (Q3)",
    finalP2MapQ4Title: "Round 2 — mapping (Q4)",
    finalP2MapQ5Title: "Round 2 — mapping (Q5)",
    finalEndTitle: "Finish final",
    finalEndName: "End",
    finalEndHint:
      "This is the end of the final. The display will show the show logo, the winning team's points, or the prize amount (depending on settings).",
    finalEndBtn: "Finish final",
    roundsMsg: {
      gameReady: "Game ready. The screen is waiting to start.",
      introAlready: "Game intro has already been played.",
      introRunning: "Intro started.",
      introDone: "Intro finished. You can start the round.",
      noMoreQuestions: "No more questions available for further rounds (all used).",
      duelWait: "Waiting for buzzer.",
      duelRetry: "Retry the buzz.",
      duelFirstClick: "First: team {team}. Confirm or retry.",
      duelFirstAnswer: "Duel — first answers: team {team}.",
      duelNextTeam: "Now team {team} answers.",
      duelReset: "Both answers wrong — new cycle. Team {team} starts.",
      duelResultWin: "Team {team} wins the duel.",
      playControl: "Team {team} is playing.",
      playNoControl: "No team in control.",
      playPassOnlyDuring: "You can pass the question only during play.",
      playNoMorePass: "You can't pass the question anymore this round.",
      playPassed: "Question passed. Team {team} now plays.",
      stealNoControl: "Can't start steal — no team in control.",
      stealPrompt: "Steal: team {team} answers. Click an answer or “X (miss)”.",
      stealChance: "Steal chance. Team {team} answers.",
      stealSuccess: "Steal successful — bank goes to the stealing team.",
      stealFail: "Steal failed — bank stays with the playing team.",
      revealNone: "No answers to reveal.",
      revealInfo: "Click missing answers to show them on the display (no points change).",
      revealDone: "All answers revealed. Round over.",
      roundNoControlBank: "No team in control — can't award the bank.",
      roundBank: "Round over. {bank} pts for team {team}.",
      roundBankMult: "Round over. {bank} pts for team {team} (x{mult} = {awarded} pts).",
      roundToFinal: "Rounds completed. Moving to the final.",
      roundNext: "Round ended. You can start the next round.",
      roundLast: "That was the last round. Proceed to end the game.",
      timerTimeoutX: "Time's up — miss.",
      gameEndDraw: "Game over. Draw {a}:{b}.",
      gameEndWin: "Game over. Team {team} wins with {pts} pts.",
      roundStartSfx: "Starting round — transition sound is playing.",
    },
    roundsHost: {
      roundTitleDuelBuzzer: "ROUND {round} — BUZZER",
      roundTitleDuel: "ROUND {round} — DUEL",
      roundTitlePlay: "ROUND {round} — PLAY",
      roundTitleSteal: "ROUND {round} — STEAL",
      roundTitleReveal: "ROUND {round} — REVEAL",
      roundTitleDefault: "ROUND {round}",
    },
    finalMsg: {
      errMissing5: "Missing 5 final questions (confirm in settings).",
      timerPlaceholder: "—",
      timerRunning: "Countdown running…",
      finalDisabled: "Final is not enabled.",
      finalNeedsPick: "Confirm 5 final questions in settings.",
      finalNeedsPoints: "Final is available only after reaching {pts} points.",
      finalStarted: "Final started.",
      round2Started: "Round 2 started.",
      endNoPrize: "Final finished. The logo will be shown.",
      end200Plus: "Threshold reached! {mainPrize}",
      endBelow200: "Below the threshold. {smallPrize}",
      defaultMainPrize: "Main prize",
      defaultSmallPrize: "Prize from points",
      startError: "Failed to start final.",
    },
    finalHost: {
      entryDone: "entered",
      entryEmpty: "missing",
      entryRepeat: "repeat",
      titleRound1Timer: "FINAL ROUND 1 — COUNTDOWN {seconds}s",
      titleRound1: "FINAL ROUND 1",
      titleRound2Timer: "FINAL ROUND 2 — COUNTDOWN {seconds}s",
      titleRound2: "FINAL ROUND 2",
      titleRound1Reveal: "FINAL ROUND 1 — REVEAL",
      titleRound2Reveal: "FINAL ROUND 2 — REVEAL",
      titleRevealRound1: "FINAL — REVEAL (ROUND 1)",
      titleRevealRound2: "FINAL — REVEAL (ROUND 2)",
      questionLabel: "Question {n}",
      player1Label: "Player 1",
      enteredLabel: "Entered",
      statusRepeat: "repeat",
      statusEmpty: "no answer",
      statusMatch: "from list",
      statusMissing: "not on list",
      statusLabel: "Status",
      answersListLabel: "Answer list:",
    },
    finalUi: {
      questionLabel: "Question {n}",
      inputPlaceholder: "Type…",
      p2HintP1Prefix: "Player 1 answer: ",
      p2RepeatOn: "Repeat ✓",
      p2RepeatOff: "Repeat",
      mapHintInputPrefix: "Entered: ",
      mapHintNoInput: "No entry",
      mapHintNoText: "No answer entered — empty / 0 pts.",
      mapListTitle: "Answer list",
      mapListEmpty: "No answer list.",
      mapBtnSkip: "No answer",
      mapBtnMiss: "Not on the list (0 pts)",
      fallbackAnswer: "—",
      p1EmptyUi: "No answer",
      timerStop: "Stop countdown",
      timerStart15: "Start countdown (15s)",
      timerStart20: "Start countdown (20s)",
      tableQuestion: "Question",
      tableAnswer: "Answer",
      tablePlayer1Answer: "Player 1 answer",
      tableRepeat: "Repeat",
      playerAnswer: "Player answer",
      player2Answer: "Player 2 answer",
      player1Answer: "Player 1 answer",
      revealAnswer: "Reveal answer",
      revealPoints: "Reveal points",
      occupied: "taken",
    },
    noId: "Missing ?id in URL.",
    gameNotReady: "This game is not ready because: {reason}",
    dataMismatch: "Game data mismatch (validate vs games).",
    qrCopyOk: "Device link copied.",
    qrCopyFail: "Failed to copy device link.",
    unloadWarn: "If you leave now, the current game state will be lost.",
    confirmBack: "Going back to the games list will lose the current state. Continue?",
    audioOk: "Sound unlocked.",
    audioFail: "Failed to unlock sound.",
    finalConfirmed: "Confirmed.",
    finalReloadStart: "Refreshing question list...",
    finalReloadDone: "Question list refreshed.",
    advSaved: "Extra settings saved.",
    advReset: "Defaults restored.",
    deviceStatusOk: "CONNECTED",
    deviceStatusOffline: "OFFLINE",
    deviceStatusNone: "—",
    deviceSeenNone: "none",
    deviceSeenSeconds: "{seconds}s ago",
    deviceDropped: "Warning: {label} disconnected. Check the device internet connection.",
    presenceNoTable: "Missing device_presence table.",
    audioStatusOk: "OK",
    controlPrefix: "Control panel — ",
    controlTitle: "Control panel",
    qrHide: "Hide QR",
    dash: "—",
    answerFallback: "—",
    copyOk: "Copied.",
    copyFail: "Can't copy.",
  },
  demo: {
    baseUrl: "https://www.familiada.online/demo/en",
    files: {
      base: "base.json",
      logoText: "logo_text.json",
      logoTextPix: "logo_text-pix.json",
      logoDraw: "logo_draw.json",
      logoImage: "logo_image.json",
      pollTextOpen: "poll_text_open.json",
      pollTextClosed: "poll_text_closed.json",
      pollPointsOpen: "poll_points_open.json",
      pollPointsClosed: "poll_points_closed.json",
      prepared: "prepared.json",
      pollPointsDraft: "poll_points_draft.json",
      pollTextDraft: "poll_text_draft.json",
    },
    modalTitle: "RESTORING DEMO…",
    modalSub: "Do not close the page. This window blocks the interface until it finishes.",
    fetchFailed: "DEMO: failed to fetch {url} (HTTP {status})",
    noUser: "DEMO: no logged-in user.",
    stepImportBase: "Import question base",
    stepImportLogos: "Import logos 4/4 (single operation)",
    stepImportPoll1: "Import poll 1/4 (poll_text_open)",
    stepImportPoll2: "Import poll 2/4 (poll_text_closed)",
    stepImportPoll3: "Import poll 3/4 (poll_points_open)",
    stepImportPoll4: "Import poll 4/4 (poll_points_closed)",
    stepImportDraft1: "Import draft 1/3 (prepared)",
    stepImportDraft2: "Import draft 2/3 (poll_points_draft)",
    stepImportDraft3: "Import draft 3/3 (poll_text_draft)",
    progressStart: "Start…",
    progressOk: "OK",
    progressDone: "Done ✅",
    progressDoneMsg: "Demo restored. You can use the app normally.",
    progressError: "Error ❌",
    progressErrorMsg: "Error: {error}",
  },
  display: {
    title: "Display like classic Familiada",
    qrHost: "Host",
    qrBuzzer: "Buzzer",
    qrHostAlt: "QR Host",
    qrBuzzerAlt: "QR Buzzer",
    sumLabel: "SUM",
  },
  host: {
    title: "Familiada — host",
    swipeRevealDown: "Swipe down to reveal",
    swipeCoverUp: "Swipe up to cover",
    swipeRevealRight: "Swipe right to reveal",
    swipeCoverLeft: "Swipe left to cover",
  },
  buzzer: {
    title: "Familiada — buzzer",
    btnA: "Buzzer A",
    btnB: "Buzzer B",
  },
  bases: {
    title: "Familiada — question bases",
    backToGames: "← My games",
    logout: "Log out",
    headerTitle: "Your question bases",
    headerHint: "Click a tile to select it.",
    actions: {
      browse: "Browse",
      browseMobile: "Browse",
      share: "Share",
      shareMobile: "Share",
      export: "Export",
      exportMobile: "Exp",
      import: "Import",
      importMobile: "Imp",
      remove: "Delete",
    },
    common: {
      save: "Save",
      cancel: "Cancel",
    },
    progress: {
      placeholder: "—",
    },
    defaults: {
      name: "New question base",
      slug: "base",
      baseLabel: "Base",
      category: "Category",
      tag: "Tag",
    },
    nameModal: {
      titleCreate: "New base",
      titleRename: "Rename base",
      subCreate: "Enter base name.",
      subRename: "Change base name.",
      placeholder: "Name...",
      failed: "Failed",
    },
    importModal: {
      title: "Import",
      subtitle: "Choose a JSON file or paste JSON below.",
      loadFile: "Load file",
      placeholder: "Paste JSON here...",
      confirm: "Import",
      cancel: "Close",
    },
    exportModal: {
      title: "EXPORT…",
      subtitle: "Do not close the page. Preparing the file.",
    },
    shareModal: {
      title: "Share base",
      subtitle: "Add users by username or email. If it fails, we'll show “Failed”.",
      placeholder: "Username or email...",
      roleEditor: "Edit",
      roleViewer: "View",
      add: "Add",
      close: "Close",
    },
    delete: {
      title: "Delete base",
      text: "Delete “{name}”? This can't be undone.",
      ok: "Delete",
      cancel: "Cancel",
      failed: "Failed to delete.",
    },
    export: {
      steps: {
        start: "Export: start…",
        base: "Export: base…",
        folders: "Export: folders…",
        questions: "Export: questions…",
        questionTags: "Export: question tags…",
        download: "Downloading…",
      },
      count: "Count: {count}",
      errorStep: "Error ❌",
      failed: "Failed to export.",
    },
    import: {
      invalidFormat: "Invalid file format (missing base / questions).",
      fileReadFailed: "Failed to read file",
      invalidJson: "Invalid JSON",
      pickFile: "Choose a file",
      pasteJson: "Paste JSON",
      success: "Imported",
      failed: "Failed",
      errorStep: "Error ❌",
      errorMsg: "Import failed.",
      steps: {
        start: "Import: start…",
        default: "Import…",
        createBase: "Import: creating base…",
        categories: "Import: categories…",
        tags: "Import: tags…",
        questions: "Import: questions…",
        questionTags: "Import: question tags…",
        categoryTags: "Import: category tags…",
      },
    },
    roles: {
      editorBadge: "EDIT",
      viewerBadge: "READ",
    },
    share: {
      empty: "No shares.",
      roleEditor: "Edit",
      roleViewer: "View",
      remove: "Remove",
      failed: "Failed",
      invalidEmail: "Invalid email",
      unknownUser: "Unknown username",
      owner: "You own this base",
      success: "Shared",
      removeTitle: "Remove share",
      removeText: "Remove access for {email}?",
      removeOk: "Remove",
      removeCancel: "Cancel",
    },
    badges: {
      from: "From: {name}",
      editAccess: "You have edit access",
      viewAccess: "Read-only access",
      sharedOthers: "Shared with others ({count})",
      notShared: "Not shared",
    },
    sections: {
      mine: "My bases",
      newBase: "New base",
      shared: "Shared",
      sharedEmpty: "No shared bases.",
    },
  },
  polls: {
    title: "Familiada — poll",
    backToGames: "← My games",
    backToHub: "← Polls hub",
    logout: "Log out",
    pageTitle: "Poll",
    linkPlaceholder: "Link will appear after opening...",
    qrFailed: "QR failed.",
    missingId: "Missing id parameter.",
    defaultName: "Poll",
    actions: {
      copyLink: "Copy link",
      copyShort: "Copy",
      openLink: "Open link",
      openShort: "Open",
      previewResults: "Results preview",
      resultsShort: "Results",
      cancel: "Cancel",
      closeAndNormalize: "Close and normalize",
      noPoll: "No poll",
      openPoll: "Start poll",
      openReady: "Ready to start.",
      closePoll: "Close poll",
      closeReady: "You can close the poll.",
      reopenPoll: "Reopen poll",
      reopenHint: "Will start a new session and delete previous poll data.",
      unknownStatus: "Unknown status.",
    },
    results: {
      title: "Results",
      loading: "Loading…",
      final: "Result:",
      live: "Live preview:",
    },
    empty: {
      title: "No game",
      meta: "Open the page with parameter <b>polls.html?id=...</b>.",
    },
    meta: {
      pollText: "Mode: text poll. Start: ≥ {min} questions. Close: each question needs ≥ 3 distinct answers.",
      pollPoints:
        "Mode: points. Start: ≥ {min} questions and each question has {minAns}–{maxAns} answers. Close: each question needs at least 3 answers with ≥ 3 points after normalization to 100.",
      prepared: "Prepared game has no poll.",
    },
    validation: {
      openOnlyDraft: "You can start a poll only from DRAFT.",
      preparedNoPoll: "Prepared game has no poll.",
      minQuestions: "To start: number of questions must be ≥ {min} (you have {count}).",
      pointsRange: "In POINTS mode each question must have {min}–{max} answers.",
      reopenOnlyClosed: "Reopen is possible only when the poll is CLOSED.",
      closeOnlyOpen: "You can close the poll only when it's OPEN.",
      noActiveSession: "No active voting session.",
      noActiveSessionGeneric: "No active session.",
      closeMinPoints:
        "To close: each question must have at least 3 answers with ≥ 3 points after normalization.",
      closeMinTextAnswers: "To close: each question must have ≥ 3 distinct answers.",
      unknownType: "Unknown game type.",
    },
    copy: {
      success: "Poll link copied.",
      failed: "Failed to copy.",
    },
    modals: {
      open: {
        title: "Start poll?",
        text: "Start poll for “{name}”?",
        ok: "Start",
        cancel: "Cancel",
      },
      closePoints: {
        title: "Finish poll?",
        text: "Close the poll and normalize points to 100?",
        ok: "Finish",
        cancel: "Cancel",
      },
      reopen: {
        title: "Reopen poll?",
        text: "Reopen the poll? Previous data will be deleted.",
        ok: "Reopen",
        cancel: "Cancel",
      },
      closeText: {
        title: "Close poll?",
        text: "Close the poll, pick TOP 6 and save points to 100 for each question?",
        ok: "Close",
        cancel: "Cancel",
      },
    },
    status: {
      opened: "Poll opened.",
      closedPoints: "Poll closed. Game ready (unique points).",
      reopened: "Poll reopened.",
      closed: "Poll closed. Game ready.",
    },
    errors: {
      open: "Failed to open poll.",
      close: "Failed to close poll.",
      reopen: "Failed to reopen.",
      loadAnswers: "Failed to load answers.",
    },
    textClose: {
      title: "Closing — answer editing",
      loading: "Loading answers from last session…",
      instructions:
        "Drag an answer onto another to merge them (sums counts). You can delete. Finally we take TOP 6 and normalize to 100.",
      hint: "Drag to merge • fix typos • final max 17 chars",
      mergeTitle: "Merge duplicates",
      mergeLabel: "Merge duplicates",
      remove: "Remove",
      editHint: "Edit answers, then click “Close and normalize”.",
      cancelled: "Closing cancelled (poll still open).",
      minAnswers: "Question {ord}: fewer than 3 answers after editing. Add/merge differently.",
      leaveTitle: "You have merging open",
      leaveText: "If you leave now, you'll lose unsaved changes. Leave anyway?",
      leaveOk: "Leave",
      leaveCancel: "Stay",
      leaveCheckTitle: "You have answer review open",
      leaveCheckText: "Leaving will lose unsaved changes. Leave?",
      logoutWarn: "Logging out will lose unsaved changes. Log out?",
      logoutOk: "Log out",
    },
  },
  manual: {
    title: "Familiada — guide",
    legal: "Privacy Policy 🔐",
    backToGames: "← My games",
    logout: "Log out",
    pageTitle: "User guide",
    tabs: {
      general: "Overview",
      edit: "Creating and editing a game",
      bases: "Question bases",
      polls: "Polls",
      logo: "Logo creation",
      control: "Control panel",
      demo: "Demo - starter materials",
    },
    demo: {
      modalTitle: "Restore demo files?",
      modalText: "Sample starter materials will be added.",
      modalOk: "Restore",
      modalCancel: "Cancel",
    },
    content: {
      general: `<p class="m-p">
        This page is a guide to running a game (tournament)
        in the style of “Familiada.” Its goal is to explain how to prepare a game,
        collect results (polls), and smoothly run a live match
        — even if someone uses the system for the first time.
      </p>
      
      <p class="m-p">
        The description focuses on the tool and how to use it,
        not on “television production.” The system works well for events,
        company parties, school, stage shows, or just with friends
        — anywhere you want a clear board, points, and a smooth flow of play.
      </p>
      
      <p class="m-p">
        The gameplay is structured to closely match the official rules of Familiada
        (rounds, bank, X errors, steals, and the final), but the whole thing is designed as
        a convenient system for hosting the game/tournament, with a clear division of roles:
        <span class="m-strong">the host leads the conversation and asks the questions</span>,
        while <span class="m-strong">the operator controls the board and points</span>.
      </p>

      <p class="m-p">
        If you want to read the full rules of the game,
        <a href="https://s.tvp.pl/repository/attachment/6/8/f/68f09c03ff0781fa510c2fd90c3ba19b1569224834470.pdf"
           target="_blank"
           rel="noopener">
          The “Familiada” game show rules
        </a>
        describe them in detail.
      </p>

      <p class="m-p">
        The whole system is designed
        to clearly separate content preparation
        from the actual gameplay.
        Questions, answers, and polls are prepared in advance,
        while during the game the operator uses only
        the control panel.
      </p>

      <p class="m-p">
        In practice this means that on the day of the recording
        the operator doesn’t edit data,
        the host focuses on talking with the contestants,
        and the system keeps track of stages and game logic.
        This reduces the risk of mistakes and speeds up the flow of the game.
      </p>

      <p class="m-p">
        The system works best when using separate devices:
        a display for the audience (TV or projector),
        a tablet or phone for the host,
        a separate device acting as the buzzer,
        and the operator’s computer with the control panel.
      </p>

      <p class="m-p">
        The guide is divided into tabs.
        Each tab describes a different stage of working with the system:
        from preparing the game,
        through polls,
        to running the live gameplay.
      </p>`,
      edit: `<p class="m-p">
        The “Creating and editing a game” tab describes the stage of preparing the game
        before starting the poll or the live match.
        At this stage you create the structure of the game:
        questions, possible answers, and how they are scored.
      </p>
    
      <p class="m-p">
        This stage is key, because it determines
        how all later work with the game will look.
        The system deliberately separates content preparation
        from later data collection and live gameplay.
      </p>
    
      <h3 class="m-h2">Game list (“My games”)</h3>
    
      <p class="m-p">
        The game list is the place where you manage all games
        assigned to your account.
        This is where you can create new games,
        choose existing ones,
        and decide what you want to do next.
      </p>
    
      <p class="m-p">
        Games are divided into types.
        The game type determines how answers will be collected
        and how points will be generated on the board later.
      </p>
    
      <ul class="m-ul">
        <li>
          <span class="m-strong">Standard poll</span> —
          answers are typed in by respondents,
          and points are based on the number of mentions.
        </li>
        <li>
          <span class="m-strong">Answer scoring</span> —
          respondents choose from prepared answers,
          and the system counts votes.
        </li>
        <li>
          <span class="m-strong">Prepared</span> —
          answers and points are set manually,
          without a poll.
        </li>
      </ul>
    
      <p class="m-p">
        You create a new game by clicking the tile with the “＋” symbol.
        After creation the game appears on the list
        and can be opened in the editor.
      </p>
    
      <h3 class="m-h2">Game editor — what and when can be edited</h3>
    
     <p class="m-p">
        You enter the game edit mode from the “My games” list
        using the <span class="m-code">Edit</span> button.
        This is the first stage of working on the game,
        where you prepare its full content
        before using it in a poll or live gameplay.
      </p>
      
      <p class="m-p">
        In edit mode you create questions and answers,
        decide on the game type,
        and prepare the structure
        that will later be used
        to collect data or run the live game.
      </p>
      
      <p class="m-p">
        The game editor is used to build the structure of questions and answers.
        Depending on the game type and its state,
        the available editing options may differ.
      </p>
    
      <p class="m-p">
        This is intentional.
        The system limits certain operations
        to keep data consistent
        and prevent situations
        where the gameplay or poll
        no longer matches the prepared content.
      </p>
    
      <h3 class="m-h3">Adding and editing questions</h3>
    
      <p class="m-p">
        Questions are always the core element of the game.
        During preparation you can:
        add new questions,
        change their wording,
        and remove unnecessary questions.
      </p>
    
      <p class="m-p">
        Changing a question after a poll has started
        may be blocked,
        because even a small text change
        affects the meaning of collected answers.
      </p>
    
      <h3 class="m-h3">Adding and editing answers</h3>
    
      <p class="m-p">
        The ability to edit answers depends on the game type.
        In poll-based games answers are the result of a survey,
        so before the poll you can only prepare
        their general structure or examples.
      </p>
    
      <p class="m-p">
        After the poll starts, the system may limit
        adding or removing answers
        so that responses from respondents
        are not mixed with new content.
      </p>
    
      <h3 class="m-h3">Points — why they are sometimes locked</h3>
    
      <p class="m-p">
        Points are not always editable by hand.
        In poll-based games points result directly
        from the number of answers given,
        so manual editing makes no sense
        and is blocked.
      </p>
    
      <p class="m-p">
        Manual point setting is possible
        only in prepared mode,
        where the system does not use survey data.
      </p>
    
      <div class="m-note">
        <b>Why is that?</b><br/>
        Thanks to this, what the audience sees on the board
        always matches the actual poll results
        or a clearly defined, manual scoring.
      </div>
    
      <h3 class="m-h2">Length and format limits</h3>
    
      <p class="m-p">
        Answers should be short and readable.
        When importing content, answers longer
        than <span class="m-strong">17 characters</span>
        are automatically trimmed.
      </p>
    
      <p class="m-p">
        This limit comes from the board layout
        and aims to keep things readable
        during live gameplay.
      </p>
    
      <h3 class="m-h2">Importing and exporting games</h3>
    
      <p class="m-p">
        Builder allows exporting and importing games
        as files or directly into a question base.
        This feature is used to move games and questions
        between accounts or environments.
      </p>
    
      <p class="m-p">
        Import and export files are a technical format.
        You should not alter their contents
        or try to edit them manually.
      </p>
    
      <div class="m-warn">
        <b>Warning:</b>
        manual modification of import or export files
        can make a game impossible to import
        or cause it to work incorrectly.
      </div>
    
      <p class="m-p">
        After a successful import, the game appears
        in the game list and can be further edited
        only using the system editor.
      </p>
      
      <p class="m-p">
        When exporting a game to a base:
      </p>
      
      <ul class="m-ul">
        <li>a new folder is created in the base root</li>
        <li>the folder is named after the game</li>
        <li>all questions belonging to the game are saved inside</li>
      </ul>

      <p class="m-note">
        You can export only to your own base or to a shared base where you are an editor.
        If you do not currently have any bases, you will not be able to export.
      </p>
      
      <p class="m-p">
        Thanks to this each game can be turned into a set of questions for further editing,
        organizing into folders, tagging, and reusing
        in future games.
      </p>
      
      <p class="m-note">
        Exporting to a base does not remove the game — it only creates a copy as a question structure.
      </p>`,
      bases: `<h2 class="m-h2">Question bases — organization and collaboration</h2>
  
      <p class="m-p">
        Question bases are a central place for storing all questions used in games.
        They let you organize questions in folders, tag them, assign categories,
        and share entire bases with other users.
      </p>
      <p class="m-p">
        You access question bases from the top bar of the “My games” page
        using the <span class="m-code">Question bases 🗃️</span> button.
      </p>
  
      <p class="m-p">
        A single base can contain hundreds or thousands of questions organized in a structure similar
        to a classic file manager on a computer.
      </p>
  
      <h3 class="m-h3">➕ Adding a new base</h3>
  
      <p class="m-p">
        In the “Question bases” view click the <span class="m-strong">New base</span> tile.
        A window will open where you enter the base name.
      </p>
  
      <p class="m-p">
        After saving, the new base appears in the list and you can immediately browse or share it.
      </p>
  
      <h3 class="m-h3">🤝 Sharing a base</h3>
  
      <p class="m-p">
        You can share any base with other users by providing their email address.
        Two modes are available:
      </p>
  
      <ul class="m-ul">
        <li><span class="m-strong">Edit</span> — the user can add, delete, and modify questions, folders, tags, create games from questions, and export questions to a base</li>
        <li><span class="m-strong">View</span> — the user can only browse the base and create games from available questions</li>
      </ul>
  
      <p class="m-p">
        Only the base owner can manage sharing.
      </p>
  
      <h3 class="m-h3">📂 Opening the base manager</h3>
  
      <p class="m-p">
        To enter a base, select it in the list and click the <span class="m-code">Browse</span> button.
      </p>
  
      <p class="m-p">
        Base Explorer will open — an advanced question manager that works like a classic file explorer.
      </p>
  
      <h2 class="m-h2">Base Explorer — question manager</h2>
  
      <p class="m-p">
        Base Explorer lets you manage questions in a way familiar from system file managers:
        folders, drag-and-drop moves, copy, cut, and quick selection.
      </p>
  
      <p class="m-p">
        Each “file” in this manager is a single question.
        Folders are used to group questions thematically or logically.
      </p>
  
      <p class="m-p">
        You can:
      </p>
  
      <ul class="m-ul">
        <li>create arbitrarily nested folders</li>
        <li>move questions and folders between each other</li>
        <li>copy and duplicate items</li>
        <li>delete selected items</li>
        <li>search by name and tags</li>
      </ul>
  
      <p class="m-note">
        The interface and keyboard shortcuts work similarly to classic file managers
        (Explorer, Finder, Total Commander).
      </p>
  
      <h2 class="m-h2">Tags and categories</h2>
  
      <h3 class="m-h3">🏷️ Tags</h3>
  
      <p class="m-p">
        Each question can have any number of tags.
        Tags are used to label questions by topic — e.g. “history,” “sports,” “easy,” “for kids.”
      </p>
  
      <p class="m-p">
        You can:
      </p>
  
      <ul class="m-ul">
        <li>create your own tags with colors</li>
        <li>assign multiple tags to a single question</li>
        <li>filter the view by selected tags</li>
      </ul>

      <p class="m-p">
        Tag assignment takes place in a dedicated window, which you can open from the toolbar
        or the context menu.
      </p>
      
      <p class="m-p">
        In the tag assignment window you can see a list of all available tags and their states:
      </p>
      
      <ul class="m-ul">
        <li>selected — the tag is assigned to all selected items</li>
        <li>unselected — the tag is assigned to none of them</li>
        <li>partial — only part of the selection has the tag</li>
      </ul>
      
      <p class="m-p">
        Clicking a tag cycles its state, enabling quick adding and removing of tags
        for many questions or folders at once. This window also allows creating new tags.
      </p>
      
      <p class="m-p">
        Tags can also be used as filters — clicking a tag on the left narrows the view
        to items marked with the selected tag or tag set.
      </p>
  
      <p class="m-note">
        A folder shows tag markers when all questions inside it
        (and subfolders) have the same tag.
      </p>
  
      <h3 class="m-h3">📌 Categories</h3>
  
      <p class="m-p">
        Categories are special system labels that indicate
        which game type a given question fits. This corresponds to game types in the <span class="m-strong">My games</span> view.
      </p>
  
      <p class="m-p">
        For example:
      </p>
  
      <ul class="m-ul">
        <li>questions with answers and points go to the <span class="m-strong">prepared</span> category</li>
        <li>questions with answers but no points total go to <span class="m-strong">scoring</span></li>
        <li>text-only questions without points go to <span class="m-strong">standard</span></li>
      </ul>
  
      <p class="m-p">
        Categories are assigned automatically based on the question structure,
        not manually by the user.
      </p>
  
      <p class="m-note">
        This way you immediately know which questions suit a specific game type.
      </p>
  
      <h2 class="m-h2">Question editor</h2>
  
      <p class="m-p">
        You can open any question in the editor.
        The editor lets you change the question text, answers, and points (if present).
      </p>
  
      <p class="m-p">
        The system enforces basic rules such as:
      </p>
  
      <ul class="m-ul">
        <li>the maximum number of points for a single answer</li>
        <li>the total sum of points in a question</li>
      </ul>
  
      <p class="m-p">
        Thanks to this the base always stays consistent and ready for use in games.
      </p>
  
      <h2 class="m-h2">Creating a game from questions</h2>
  
      <p class="m-p">
        In the base manager you can select any questions and folders (including subfolders),
        and then create a new game from them.
      </p>
  
      <p class="m-p">
        The system collects all questions from the selection, lets you review them,
        and choose the game type.
      </p>

      <p class="m-note">
        This enables fast game building from ready sets of questions without manual retyping.
      </p>

      <p class="m-warn">
        After successful game creation you will be redirected to the <span class="m-strong">My games</span> view.
      </p>
  
      <h2 class="m-h2">⌨️ Keyboard shortcuts — Base manager</h2>
  
      <h3 class="m-h3">📁 Create</h3>
  
      <table class="m-table">
        <tr><th>Action</th><th>Windows / Linux</th><th>macOS</th></tr>
        <tr><td>New question</td><td>Ctrl + N</td><td>⌘ N</td></tr>
        <tr><td>New folder</td><td>Ctrl + Shift + N</td><td>⌘ ⇧ N</td></tr>
      </table>
  
      <h3 class="m-h3">✏️ Edit</h3>
  
      <table class="m-table">
        <tr><th>Action</th><th>Windows / Linux</th><th>macOS</th></tr>
        <tr><td>Edit question</td><td>Ctrl + E</td><td>⌘ E</td></tr>
        <tr><td>Rename</td><td>F2</td><td>F2</td></tr>
        <tr><td>Delete</td><td>Delete</td><td>Fn + ⌫</td></tr>
      </table>
  
      <h3 class="m-h3">📋 Clipboard</h3>
  
      <table class="m-table">
        <tr><th>Action</th><th>Windows / Linux</th><th>macOS</th></tr>
        <tr><td>Copy</td><td>Ctrl + C</td><td>⌘ C</td></tr>
        <tr><td>Cut</td><td>Ctrl + X</td><td>⌘ X</td></tr>
        <tr><td>Paste</td><td>Ctrl + V</td><td>⌘ V</td></tr>
        <tr><td>Duplicate</td><td>Ctrl + D</td><td>⌘ D</td></tr>
      </table>
  
      <h3 class="m-h3">🎮 Game</h3>
  
      <table class="m-table">
        <tr><th>Action</th><th>Windows / Linux</th><th>macOS</th></tr>
        <tr><td>Create game</td><td>Ctrl + G</td><td>⌘ G</td></tr>
      </table>
  
      <h3 class="m-h3">🔄 View</h3>
  
      <table class="m-table">
        <tr><th>Action</th><th>Windows / Linux</th><th>macOS</th></tr>
        <tr><td>Refresh view</td><td>Ctrl + Alt + R</td><td>⌘ ⌥ R</td></tr>
      </table>
  
      <h3 class="m-h3">📌 Navigation</h3>
  
      <table class="m-table">
        <tr><th>Action</th><th>Windows / Linux</th><th>macOS</th></tr>
        <tr><td>Select all</td><td>Ctrl + A</td><td>⌘ A</td></tr>
        <tr><td>Open folder</td><td>Enter</td><td>⏎</td></tr>
        <tr><td>Parent folder</td><td>Backspace</td><td>⌫</td></tr>
      </table>
  
      <p class="m-note">
        Shortcuts do not work while typing in edit fields.
      </p>`,
      polls: `<p class="m-p">
        The “Polls” tab describes the stage of collecting responses
        from respondents before the live match.
        The poll is a bridge between game preparation
        and the live gameplay.
      </p>
    
      <p class="m-p">
        At this stage the system stops being a content editor
        and starts working as a data collection tool.
        For this reason many editing options are deliberately limited.
      </p>

      <p class="m-p">
        You reach polls from the “My games” list
        using the <span class="m-code">Polls Hub</span> button.
        This stage happens after finishing game editing
        and is used only to collect responses
        or votes from respondents.
      </p>
      
      <p class="m-p">
        When a poll starts,
        the game stops being editable
        and begins serving as a data collection tool.
        Therefore some options available in the editor
        are deliberately blocked in this mode.
      </p>

      <h3 class="m-h2">Polls hub (polls-hub)</h3>

      <p class="m-p">
        The polls hub is a separate panel for managing polls, tasks, and subscriptions.
        You open it from the “My games” list with the <span class="m-code">Polls Hub</span> button.
        On desktop you see two cards, each with two lists.
      </p>

      <ul class="m-ul">
        <li><span class="m-strong">Polls</span> — the “My polls” list and “Tasks.”</li>
        <li><span class="m-strong">Subscriptions</span> — the “My subscribers” list and “My subscriptions.”</li>
      </ul>

      <p class="m-p">
        The gold dot on the “Polls” card shows the number of active tasks to complete,
        and on the “Subscriptions” card the number of invitations to accept.
      </p>

      <p class="m-p">
        A subscription is a permanent connection between your account and an invited user —
        once accepted, it allows sharing future polls without re-entering the email.
        You send an invitation in the “My subscribers” section by entering an email or username
        and clicking <span class="m-code">Invite</span>. The recipient accepts the invite in their
        Polls Hub or via the link in the message, and the status becomes active.
      </p>

      <p class="m-p">
        Sharing a poll is done from the “My polls” list: select the tile and click
        <span class="m-code">Share</span>, then choose subscribers and save.
        The poll tile shows current votes, and the <span class="m-code">Details</span> button
        provides a view of submitted votes, pending, rejected, and anonymous responses.
      </p>

      <h3 class="m-h3">My polls</h3>
      <p class="m-p">
        Each tile has a color that indicates the poll status:
      </p>
      <ul class="m-ul">
        <li><span class="m-strong">Gray</span> — draft, missing requirements to start.</li>
        <li><span class="m-strong">Red</span> — draft ready to start.</li>
        <li><span class="m-strong">Orange</span> — poll open, no votes.</li>
        <li><span class="m-strong">Yellow</span> — poll open, there are votes or active tasks.</li>
        <li><span class="m-strong">Green</span> — poll open, goals reached (tasks done or ≥10 votes).</li>
        <li><span class="m-strong">Blue</span> — poll closed.</li>
      </ul>

      <h3 class="m-h3">Tasks</h3>
      <p class="m-p">
        Tasks are voting invitations. Colors:
        <span class="m-strong">green</span> — available,
        <span class="m-strong">blue</span> — completed.
        Double-click opens voting, and the <span class="m-code">X</span> button rejects the task.
      </p>

      <h3 class="m-h3">My subscribers</h3>
      <p class="m-p">
        Status colors:
        <span class="m-strong">yellow</span> — pending,
        <span class="m-strong">green</span> — active,
        <span class="m-strong">red</span> — rejected/canceled.
        The <span class="m-code">X</span> button removes a subscriber, and <span class="m-code">↻</span> resends an invite.
      </p>

      <h3 class="m-h3">My subscriptions</h3>
      <p class="m-p">
        Colors:
        <span class="m-strong">yellow</span> — pending,
        <span class="m-strong">green</span> — active.
        Buttons: <span class="m-code">✓</span> accepts, <span class="m-code">X</span> rejects/cancels.
      </p>

    
      <h3 class="m-h2">Types of polls</h3>
    
      <p class="m-p">
        Depending on the game type, a poll can work in one of two modes:
      </p>
    
      <ul class="m-ul">
        <li>
          <span class="m-strong">Standard (text) poll</span> —
          respondents type their own text answers.
        </li>
        <li>
          <span class="m-strong">Scoring poll</span> —
          respondents choose one of the prepared answers.
        </li>
      </ul>
    
      <p class="m-p">
        Prepared games do not have a poll —
        answers and points are set manually.
      </p>
    
      <h3 class="m-h2">Starting a poll</h3>
    
      <p class="m-p">
        A poll can be started only for a game
        in the <span class="m-strong">Draft</span> state.
        Before starting, the system checks
        whether the game meets the minimum requirements.
      </p>
    
      <ul class="m-ul">
        <li>minimum number of questions,</li>
        <li>in scoring mode — the required number of answers per question.</li>
      </ul>
    
      <div class="m-note">
        <b>Why?</b><br/>
        This ensures you cannot start a poll
        that cannot later be properly closed
        and used in the game.
      </div>
    
      <h3 class="m-h2">Link and QR code</h3>
    
      <p class="m-p">
        After starting a poll the system generates
        a unique voting link.
        The link can be copied,
        opened in a new tab,
        or displayed as a QR code.
      </p>
    
      <p class="m-p">
        The QR code is intended to be displayed
        on a screen visible to respondents
        (TV, projector, large monitor).
      </p>
    
      <h3 class="m-h2">Poll flow</h3>
    
      <p class="m-p">
        Respondents go through the questions in order.
        The system enforces the order
        and does not allow skipping a question.
      </p>
    
      <p class="m-p">
        In a text poll each answer:
      </p>
    
      <ul class="m-ul">
        <li>is limited to 17 characters,</li>
        <li>is normalized (case, spaces),</li>
        <li>is counted as a separate proposal.</li>
      </ul>
    
      <p class="m-p">
        In a scoring poll the respondent
        chooses one of the prepared answers,
        and the system records the vote.
      </p>
    
      <h3 class="m-h2">Closing a poll</h3>
    
      <p class="m-p">
        Closing a poll is a separate,
        deliberate stage of work.
        The system will not allow closing a poll
        if the collected data does not meet
        minimum quality conditions.
      </p>
    
      <h3 class="m-h3">Scoring poll</h3>
    
      <p class="m-p">
        When closing a scoring poll
        the system converts votes into points
        and normalizes them to a 0–100 scale
        for each question.
      </p>
    
      <div class="m-note">
        <b>Result:</b>
        you get a ready list of answers with points,
        without the need for manual counting.
      </div>
    
      <h3 class="m-h3">Text poll</h3>
    
      <p class="m-p">
        In a text (classic) poll respondents type their own answers.
        After closing, the system moves to the results cleanup stage.
        The operator can merge obviously similar answers
        and remove typos or clear duplicates.
      </p>
      
      <p class="m-p">
        Then answers are normalized to the points scale.
        At this stage the system applies additional limits
        aimed at keeping the board readable
        and the gameplay dynamic.
      </p>
      
      <p class="m-p">
        Answers with a very low number of mentions
        that after normalization get
        <span class="m-strong">less than 8 points</span>
        are automatically discarded.
        Such answers usually do not matter for the game
        and would not be readable for the audience.
      </p>
      
      <p class="m-p">
        For one question, the board can show at most
        <span class="m-strong">6 answers</span>.
        If there are more correct answers,
        the system selects the highest-scoring ones
        and skips the rest.
      </p>
      
      <p class="m-p">
        For this reason the total points for a single question
        <span class="m-strong">do not always sum to exactly 100</span>.
        Points are assigned only to the answers
        that actually appear on the board.
      </p>
    
      <div class="m-warn">
        <b>Warning:</b>
        after closing a poll
        you cannot change its results
        without restarting the poll.
      </div>
    
      <h3 class="m-h2">Restarting a poll</h3>
    
      <p class="m-p">
        A closed poll can be restarted,
        which removes previous results
        and starts collecting answers from scratch.
      </p>
    
      <p class="m-p">
        This option is useful
        when the poll was started for testing
        or an organizational error occurred.
      </p>`,
      logo: `<p class="m-p">
      The system lets you set your own logo that appears on the display
      (e.g., the start or end screen). You can access the logo creator from the top bar of the “My games” page
        using the <span class="m-code">Logo🖥️</span> button.
    </p>

    <div class="m-note">
      <b>Important:</b><br/>
      The logo has a technical size of <span class="m-code">30×10</span> (character tiles) or <span class="m-code">150×70</span> (pixels).
      This limitation comes from the physical layout of the board and ensures readability live.
    </div>

    <h3 class="m-h2">Logo creation modes</h3>

    <p class="m-p">
      When creating a new logo you choose one of the modes.
      Each mode leads to the same result (a logo on the display),
      but differs in how it is created.
    </p>

    <ul class="m-ul">
      <li>
        <span class="m-strong">Text art</span> — a classic logo made of characters (the “Familiada” style).
        Good when you want a quick, readable title.
      </li>
      <li>
        <span class="m-strong">Text</span> — text editing and preview in “pixels.”
        Good when you need a different font/layout than “Text art.”
      </li>
      <li>
        <span class="m-strong">Drawing</span> — draw by hand on a grid (like a simple graphics editor).
        Good for icons and simple shapes.
      </li>
      <li>
        <span class="m-strong">Image</span> — import an image and fit it to the board.
        Good when you already have a company logo.
      </li>
    </ul>

    <h3 class="m-h2">Display preview</h3>

    <p class="m-p">
      In the editor you always see a preview “as on the board.”
      This is important because what looks good in high resolution
      may be unreadable when reduced to <span class="m-code">150×70</span>.
    </p>

    <div class="m-note">
      <b>Practical tip:</b><br/>
      Thick shapes, large letters, and high contrast work best.
      Thin lines, small details, and subtle gradients usually disappear.
    </div>

    <h3 class="m-h2">Saving and active logo</h3>

    <p class="m-p">
      You can save a logo under your own name. In the logo list you can also set
      which logo is <span class="m-strong">active</span>.
      The active logo will be used by the display automatically.
    </p>

    <p class="m-p">
      If you do not set any active logo, the system uses
      the <span class="m-strong">default logo</span>.
    </p>

    <h3 class="m-h2">Logo import and export</h3>

    <p class="m-p">
      The editor allows exporting the active logo to a file and importing a logo from a file.
      This lets you move logos between accounts or make backups.
    </p>

    <div class="m-warn">
      <b>Warning:</b><br/>
      Do not edit logo files manually. This is a technical format — manual changes may cause
      the import to fail or the logo to work incorrectly.
    </div>`,
      control: `<p class="m-p">
        You reach the Control Panel from the “My games” list
        using the <span class="m-code">Play</span> button.
        This mode is intended only for running the live game —
        you no longer edit questions or poll results here.
      </p>
    
      <p class="m-p">
        The control panel guides the operator step by step:
        first you connect devices, then set game parameters,
        and finally go through rounds and (optionally) the final.
        Each step unlocks only when the previous one is ready,
        which minimizes the risk of mistakes during recording.
      </p>
    
      <h3 class="m-h2">What must be ready before you start</h3>
    
      <ul class="m-ul">
        <li>
          The game should have prepared questions and answers (from the editor),
          and if it is a poll-based game — the poll should be closed and approved.
        </li>
        <li>
          The operator should have a computer with a large screen (the panel is designed for desktop mode).
        </li>
        <li>
          Separate devices should be prepared: a display (TV/projector), the host’s device,
          and a device acting as the buzzer.
        </li>
        <li>
          Stable Wi-Fi (the most common issues are killed background tabs / network switching).
        </li>
      </ul>
    
      <div class="m-note">
        <b>Why so many “formalities”?</b><br/>
        The gameplay is live and has a TV pace. The control panel is meant to enforce the procedure,
        not add stress for the operator. That’s why the system requires readiness of equipment and settings before starting.
      </div>
    
      <h3 class="m-h2">Who sees what</h3>
    
      <p class="m-p">
        The system deliberately separates screens so everyone does their job:
      </p>
    
      <ul class="m-ul">
        <li>
          <span class="m-strong">Operator (Control Panel)</span> — sees all buttons,
          game status, bank, Xs, messages, and the next procedural steps.
          The operator controls what appears on the board.
        </li>
        <li>
          <span class="m-strong">Display</span> — shows the game board: questions, answers,
          points, bank, errors (X), and start/end screens.
          This is the screen visible to participants and the audience.
        </li>
        <li>
          <span class="m-strong">Host</span> — receives content to read and a context preview,
          but does not control the course of the game (the operator does).
        </li>
        <li>
          <span class="m-strong">Buzzer</span> — used to signal the face-off (who is first).
        </li>
      </ul>
    
      <h3 class="m-h2">1) Devices</h3>
    
      <p class="m-p">
        The first stage in the panel is connecting devices.
        In the top bar you see three statuses:
        <span class="m-strong">Display</span>,
        <span class="m-strong">Host</span>,
        <span class="m-strong">Buzzer</span>.
        The operator starts by making sure all are online.
      </p>
    
      <h3 class="m-h3">Step 1: Display</h3>
    
      <p class="m-p">
        In this step the panel shows a QR code and link for the display.
        It’s best to open the display on a TV or projector,
        in full-screen mode (no browser bars).
        Only when the display is online will the panel allow you to proceed.
      </p>
    
      <h3 class="m-h3">Step 2: Host and buzzer</h3>
    
      <p class="m-p">
        In the second step you connect the host device and the buzzer device.
        The panel also shows a QR/link for connection.
        In practice it’s best to use two separate phones or a phone and a tablet.
      </p>
    
      <p class="m-p">
        In this step there is an option <span class="m-strong">“QR on display”</span> —
        after using it the QR codes can be shown on the large screen,
        so the crew can quickly scan them with phones.
        This speeds up the start on set because there is no need to type links manually.
      </p>
    
      <div class="m-warn">
        <b>Warning:</b><br/>
        If any device disconnects during the game, the panel can show a warning.
        Most often it helps to disable battery saving, avoid minimizing the browser,
        and keep devices on one stable Wi-Fi network.
      </div>
    
      <h3 class="m-h3">Step 3: Sound</h3>
    
      <p class="m-p">
        Browsers block automatic sound playback
        until the user performs a “gesture” (click).
        That’s why the panel has a separate step to unlock sound.
        Without it you may not hear signals that help keep the game pace.
      </p>
    
      <h3 class="m-h2">2) Settings</h3>
    
      <p class="m-p">
        When devices are online, you move on to game settings.
        This stage has two goals:
        (1) prepare readable team names on the board,
        (2) adjust game parameters to the recording (additional settings).
      </p>
    
      <h3 class="m-h3">Team names</h3>
    
      <p class="m-p">
        You set the names of Team A and Team B.
        These are the labels seen by players and the audience on the display,
        so it’s best to decide them before the rounds begin.
        The panel blocks moving forward until both names are entered.
      </p>
    
      <h3 class="m-h3">Additional settings (important for the operator)</h3>
    
      <p class="m-p">
        In “Additional settings” you tailor the game to the episode format.
        These options do not change the rules’ meaning, only the pace and thresholds.
      </p>
    
      <ul class="m-ul">
        <li>
          <span class="m-strong">Round multipliers</span> — entered comma-separated (e.g. <span class="m-code">1,1,1,2,3</span>).
          This matches the classic doubling/tripling values in later stages.
          In practice: the round bank at the end is multiplied by the current round multiplier.
        </li>
        <li>
          <span class="m-strong">Game target</span> — the point threshold after which the game can go to the final
          (in the classic format often 300). This lets you adjust the game length.
        </li>
        <li>
          <span class="m-strong">Final target</span> — the point threshold in the final (default 200 in the classic format).
        </li>
        <li>
          <span class="m-strong">Game ending</span> — what the display shows at the end
          (logo / points / final prize). This is production-important: the “last frame.”
        </li>
      </ul>
    
      <div class="m-note">
        <b>Why is this in the Control Panel and not in the editor?</b><br/>
        Because these are episode (production) settings, not question content.
        Questions shouldn’t change during the game, but game parameters sometimes do.
      </div>
    
      <h3 class="m-h3">Final: enable and choose 5 questions</h3>
    
      <p class="m-p">
        If the game should have a final, you enable it and choose exactly <span class="m-strong">5 final questions</span>.
        The panel shows a list of questions and a list “Final questions (max 5)”.
        After selecting five, you use the <span class="m-strong">Confirm</span> button.
      </p>
    
      <div class="m-warn">
        <b>Warning:</b><br/>
        The final requires 5 confirmed questions before rounds start.
        This is an intentional lock — in live play there’s no time to pick questions “on the fly.”
        If you want to change the set, use the <span class="m-strong">Edit</span> mode for final questions.
      </div>
    
      <h3 class="m-h2">3) Rounds — gameplay step by step</h3>
    
      <p class="m-p">
        In rounds you conduct the main gameplay: questions, answers, points, and the round bank.
        Players see the board on the display, the host asks questions and keeps the flow,
        while the operator reveals answers, counts points, and adds errors (X).
      </p>
      
      <p class="m-p">
        The most important practical rule: the host focuses on the contestants,
        and the operator on running the system. This keeps the game smooth,
        and the board always shows what it should at any moment.
      </p>
    
      <h3 class="m-h3">Round start: “Game ready” and intro</h3>
    
      <p class="m-p">
        When starting rounds, the panel first prepares the display (clears the board and sets the game state),
        and then lets you start the intro.
        This organizes the beginning of the recording: the audience gets a clear start,
        and the operator has a clear moment to enter the first question.
      </p>
    
      <h3 class="m-h3">Face-off: who takes control</h3>
    
      <p class="m-p">
        Each question starts with the “family heads” face-off at the podium.
        At this moment the <span class="m-strong">Buzzer</span> device is key:
        the signal from the buzzer tells the panel someone pressed first.
        The operator confirms which side gains priority,
        and the host moves on to the answers.
      </p>
    
      <p class="m-p">
        According to the rules, if the first answer is not the highest-scoring,
        the second “head” can answer better and take control.
        The panel guides the operator through the round control decision,
        and the display shows which team is currently playing (team indicator).
      </p>

      <h3 class="m-h3">Giving up the question</h3>
    
      <p class="m-p">
        According to game arrangements, after gaining control a team can also decide
        that it <span class="m-strong">gives up the question</span> to the opponents.
        This is a tactical move: instead of “finishing” the question, the team can pass the chance to rivals.
        The panel provides this option only at the right moment and ensures it cannot be abused.
      </p>
    
      <h3 class="m-h3">Playing the question: revealing answers and the bank</h3>
    
      <p class="m-p">
        After control is set, the team answers and the operator reveals the correct answers on the board.
        Each correct answer adds points to the <span class="m-strong">round bank</span>.
        The bank is visible on the display and grows with each correct answer.
      </p>
    
      <p class="m-p">
        Gameplay continues until:
        all answers are revealed,
        or the team loses three “chances” (three Xs),
        then the operator ends the stage and moves to the steal (when conditions are met).
      </p>
    
      <h3 class="m-h3">Misses (X) and the 3-second limit</h3>
    
      <p class="m-p">
        A wrong answer is marked with an <span class="m-strong">X</span> on the board.
        Three errors mean losing control and giving a steal attempt to the opponents.
        The system also has a <span class="m-strong">3-second</span> time limit for answers —
        exceeding the limit is treated as a miss (X).
      </p>
    
      <div class="m-note">
        <b>Why a timer?</b><br/>
        It’s a “whip for pace.” The timer lets the operator close hesitation quickly
        without debate and keep the rhythm of the game.
      </div>
    
      <h3 class="m-h3">Stealing the bank (one answer)</h3>
    
      <p class="m-p">
        When the playing team uses three “chances” before revealing all answers,
        the question passes to the opposing team.
        The opponents get <span class="m-strong">one answer</span>:
        if they hit — the bank goes to them,
        if not — the bank stays with the playing team.
        This closes the question and the round according to the rules.
      </p>
    
      <h3 class="m-h3">Revealing missing answers and ending the round</h3>
    
      <p class="m-p">
        After the question is resolved the operator can reveal missing answers “for information,”
        so the audience sees the full board.
        Then the operator ends the round: the bank is added to the correct team,
        taking the round multiplier into account.
      </p>
    
      <div class="m-note">
        <b>Practical note:</b><br/>
        The panel deliberately separates “playing the question” from “ending the round.”
        This way the operator doesn’t accidentally clear the board state
        before the host delivers the punchline or before “thank you” is said.
      </div>

      <h3 class="m-h3">Ending rounds and moving on</h3>
      
      <p class="m-p">
        After each round the system updates team scores and checks
        whether the end-of-game condition has been met (set in “Additional settings”).
        Most often it’s a points threshold, e.g. <span class="m-strong">300</span>,
        but it can be different — depending on how you want to run the tournament.
      </p>
      
      <p class="m-p">
        If the final is <span class="m-strong">enabled</span> and the round-end condition is met,
        the game moves to the final.
        If the final is <span class="m-strong">disabled</span>, the game ends after rounds
        and the system goes to the ending screen (logo/points/prize — according to settings).
      </p>
      
      <div class="m-warn">
        <b>Warning:</b><br/>
        If the game runs out of questions during play
        before the points threshold is reached,
        the system ends rounds due to lack of questions.
        Then the game moves to the final (if enabled)
        or to the ending (if the final is disabled).
      </div>
    
    <h3 class="m-h2">4) Final</h3>

      <p class="m-p">
        The final is a separate game mode. Two contestants
        from the team that won the main game take part.
        They answer the same <span class="m-strong">5 questions</span>,
        and their points are summed. The goal is to reach the final threshold
        (default <span class="m-strong">200 points</span>, unless set otherwise).
      </p>
      
      <h3 class="m-h3">Final preparation</h3>
      
      <p class="m-p">
        Before starting the final, in game settings you must have selected and confirmed
        <span class="m-strong">exactly 5 final questions</span>.
        This ensures the final is ready to run without searching for questions during play.
      </p>
      
      <p class="m-p">
        The second contestant should not know the first contestant’s answers.
        In practice, during the first contestant’s turn
        the second contestant turns away or wears headphones with music.
      </p>
      
      <h3 class="m-h3">Final preparation</h3>
      
      <p class="m-p">
        Before starting the final, in game settings you must have selected and confirmed
        <span class="m-strong">exactly 5 final questions</span>.
        This ensures the final is ready to run without searching for questions during play.
      </p>
      
      <p class="m-p">
        In the final it is very important that the second contestant does not know the first contestant’s answers.
        Therefore during the first contestant’s round the second contestant
        <span class="m-strong">moves away and wears headphones with music</span>,
        so they cannot hear the questions or answers.
      </p>
      
      <h3 class="m-h3">Round 1 – first contestant (15 seconds)</h3>
      
      <p class="m-p">
        The host reads five questions in a row, and the first contestant answers within
        <span class="m-strong">15 seconds</span>.
        The operator <span class="m-strong">types the answers</span> in the final panel.
        At this stage answers are not yet scored or revealed.
      </p>
      
      <p class="m-p">
        After the round the operator assigns the typed answers to the list of scored results
        and <span class="m-strong">reveals them on the board</span>.
        If an answer does not match any item in the list,
        it receives <span class="m-strong">0 points</span>.
      </p>
      
      <p class="m-p">
        After revealing the first contestant’s answers, the system hides their half of the board,
        and the host prepares the entry of the second contestant and reminds the final rules.
      </p>
      
      <h3 class="m-h3">Round 2 – second contestant (20 seconds) and repeats</h3>
      
      <p class="m-p">
        The second contestant returns and answers the same questions within
        <span class="m-strong">20 seconds</span>.
        When the half-board with the first contestant’s answers appears,
        the second contestant <span class="m-strong">turns away</span>
        so they cannot see them and be influenced.
      </p>
      
      <p class="m-p">
        The operator again first types all answers of the second contestant,
        without revealing or scoring them “live.”
        If the second person gives the same answer as the first,
        it is a <span class="m-strong">repeat</span> — the contestant must give another answer,
        and the operator can mark the attempt as repeated.
        Repeated answers do not score points.
      </p>
      
      <p class="m-p">
        After the round the operator assigns the second contestant’s answers to the list of scored results
        and <span class="m-strong">reveals them one by one</span> on the board.
        The points of both contestants are summed.
      </p>
      
      <h3 class="m-h3">When the final ends</h3>
      
      <p class="m-p">
        The final ends when the total points reach or exceed
        the set threshold. It can happen that the threshold is reached after the first contestant’s turn
        — then the second contestant does not need to play, and the game goes straight to the ending.
      </p>
      
      <p class="m-p">
        After the final the system shows the ending screen according to the game ending settings:
        <span class="m-strong">logo</span>, <span class="m-strong">points</span> or
        <span class="m-strong">prize amount</span>.
      </p>`,
      demo: `<p class="m-p">
        In this tab you can restore sample starter materials:
        a question base, logos, and ready games of different categories and states.
      </p>
  
      <p class="m-p">
        This is useful when:
      </p>
  
      <ul class="m-ul">
        <li>you want to quickly see how the system works</li>
        <li>you are testing features without creating your own data</li>
        <li>you accidentally removed the sample content</li>
      </ul>
  
      <div class="m-warn">
        Restoring demo does not remove your data — it only adds sample materials.
      </div>
  
      <div class="m-box">
        <button class="btn" id="demoRestoreBtn">
          ↺ Restore demo files
        </button>
  
        <p class="m-p m-muted" style="margin-top:10px">
          After clicking you will be taken to the My games view and demo will be loaded automatically.
        </p>
      </div>`,
    },
  },
  privacy: {
    title: "Familiada — privacy policy",
    pageTitle: "Privacy Policy",
    backToManual: "← Guide",
    logout: "Log out",
    content: `
      <h2 class="m-h2">1. Data controller</h2>
      <p class="m-p">
        The controller of personal data is the operator of the Familiada service available at
        <span class="m-code">https://www.familiada.online</span>
      </p>
      <p class="m-p">Contact: <span class="m-code">admin@familiada.online</span></p>
  
      <h2 class="m-h2">2. Scope of processed data</h2>
      <p class="m-p">We process only the data necessary to operate the service:</p>
      <ul class="m-ul">
        <li>email address,</li>
        <li>username (login),</li>
        <li>data related to participation in polls and subscriptions.</li>
      </ul>
  
      <h2 class="m-h2">3. Purposes of processing</h2>
      <p class="m-p">Personal data is processed in order to:</p>
      <ul class="m-ul">
        <li>create and manage a user account,</li>
        <li>send system messages (e.g., account confirmation, password reset),</li>
        <li>send subscription notifications and invitations to participate in polls,</li>
        <li>ensure security and proper operation of the service.</li>
      </ul>
  
      <h2 class="m-h2">4. Email messages</h2>
      <p class="m-p">We send only:</p>
      <ul class="m-ul">
        <li>transactional (system) messages,</li>
        <li>subscription notifications sent only to users who have consented to receive them.</li>
      </ul>
      <p class="m-p">We do not send marketing or advertising messages.</p>
      <p class="m-p">Sending frequency is limited to prevent abuse.</p>
  
      <h2 class="m-h2">5. Subscriptions and invitations</h2>
      <p class="m-p">Poll notifications and invitations:</p>
      <ul class="m-ul">
        <li>are sent only to known and explicitly indicated recipients,</li>
        <li>are not sent in bulk,</li>
        <li>are not sent more often than once per defined period for a given email address.</li>
      </ul>
  
      <h2 class="m-h2">6. Legal basis</h2>
      <p class="m-p">Data is processed based on:</p>
      <ul class="m-ul">
        <li>user consent (GDPR Art. 6(1)(a)),</li>
        <li>necessity to perform a contract (GDPR Art. 6(1)(b)),</li>
        <li>legitimate interest of the controller (GDPR Art. 6(1)(f)).</li>
      </ul>
  
      <h2 class="m-h2">7. Retention period</h2>
      <p class="m-p">Data is stored:</p>
      <ul class="m-ul">
        <li>for the lifetime of the user account,</li>
        <li>or until consent is withdrawn or the account is deleted.</li>
      </ul>
  
      <h2 class="m-h2">8. Data sharing</h2>
      <p class="m-p">
        We do not sell or share personal data with third parties, except for:
      </p>
      <ul class="m-ul">
        <li>technical services necessary to run the service (e.g., hosting, email delivery).</li>
      </ul>
  
      <h2 class="m-h2">9. User rights</h2>
      <p class="m-p">The user has the right to:</p>
      <ul class="m-ul">
        <li>access their data,</li>
        <li>rectify it,</li>
        <li>delete it,</li>
        <li>restrict processing,</li>
        <li>withdraw consent at any time.</li>
      </ul>
  
      <h2 class="m-h2">10. Contact</h2>
      <p class="m-p">
        For matters related to personal data protection, please contact:
        <span class="m-code">admin@familiada.online</span>
      </p>
    `,
  },
  builderImportExport: {
    defaults: {
      gameName: "Game",
      question: "Question {ord}",
      answer: "ANS {ord}",
    },
    export: {
      step: "Export: fetching questions…",
    },
    import: {
      step: "Import: creating game…",
      invalidFormat: "Invalid file format (missing game / questions).",
    },
  },
  basesImport: {
    defaults: {
      name: "New question base",
      category: "Category",
      tag: "Tag",
    },
    steps: {
      createBase: "Import: creating base…",
      categories: "Import: categories…",
      tags: "Import: tags…",
      questions: "Import: questions…",
      questionTags: "Import: question tags…",
      categoryTags: "Import: category tags…",
    },
    errors: {
      missingUserId: "importBase: missing currentUserId",
      invalidFormat: "Invalid file format (missing base / questions).",
      missingUrl: "importBaseFromUrl: missing URL",
      fetchFailed: "Cannot fetch JSON file ({status}): {url}",
      invalidJson: "Invalid base JSON format",
      noUser: "No logged-in user.",
    },
  },
  builder: {
    title: "Familiada — my games",
    nav: {
      pollsHub: "Polls hub 📊",
      pollsHubMobile: "📊",
      bases: "Question bases 🗃️",
      basesMobile: "🗃️",
      manual: "Tips ℹ️",
      manualMobile: "ℹ️",
      logo: "Logo 🖥️",
      logoMobile: "🖥️",
      account: "Account settings",
      logout: "Log out",
    },
    header: {
      title: "Your games",
      hint: "Click a tile to select it.",
    },
    actions: {
      edit: "Edit",
      editMobile: "Edit",
      play: "Play",
      playMobile: "Play",
      poll: "Poll",
      pollMobile: "Poll",
      exportFile: "Export to file",
      exportFileMobile: "Exp.file",
      exportBase: "Export to base",
      exportBaseMobile: "Exp.base",
      import: "Import",
      importMobile: "Import",
    },
    tabs: {
      pollText: "Standard poll",
      pollPoints: "Points",
      prepared: "Prepared",
    },
    import: {
      title: "Import",
      subtitle: "Choose a JSON file or paste JSON below.",
      loadFile: "Load file",
      placeholder: "Paste JSON here...",
      confirm: "Import",
      cancel: "Close",
      pickFile: "Choose a JSON file.",
      loaded: "File loaded.",
      loadFailed: "Failed to load file.",
      pasteJson: "Paste JSON or choose a file.",
      invalidJson: "Invalid JSON.",
      dbFailed: "Database error during import.",
      progress: {
        start: "Importing…",
        save: "Saving…",
        done: "Done ✅",
        errorLabel: "Error ❌",
        failed: "Import failed.",
      },
    },
    exportBase: {
      title: "Export to base",
      subtitle: "Select a question base. A folder named after the game will be created in the root.",
      confirm: "Export",
      cancel: "Close",
      empty: "No bases found.",
      metaOwned: "owned",
      metaShared: "shared",
      baseFallback: "Unnamed base",
      loadFailed: "Failed to load bases.",
      pickBase: "Select a base.",
      progress: {
        start: "Exporting…",
        step: "Preparing…",
        folder: "Creating folder…",
        questions: "Exporting questions…",
        saved: "Export saved.",
        savedCount: "Saved {done}/{total}.",
        done: "Done ✅",
        errorLabel: "Error ❌",
        failed: "Export failed.",
      },
    },
    exportFile: {
      title: "EXPORT…",
      subtitle: "Do not close the page. Preparing the file.",
      progress: {
        start: "Exporting…",
        fetch: "Loading data…",
        download: "Preparing download…",
        done: "Done ✅",
        errorLabel: "Error ❌",
        failed: "Export failed.",
      },
    },
    card: {
      delete: "Delete",
      newGame: "New game",
    },
    types: {
      pollText: "POLL",
      pollPoints: "POINTS",
      prepared: "PREPARED",
    },
    status: {
      draft: "DRAFT",
      open: "OPEN",
      closed: "CLOSED",
    },
    newGame: {
      pollText: "New poll",
      pollPoints: "New points poll",
      prepared: "New prepared",
    },
    delete: {
      title: "Delete game",
      text: "Do you really want to delete “{name}”?",
      ok: "Delete",
      cancel: "Cancel",
    },
    alert: {
      deleteFailed: "Failed to delete game.",
      createFailed: "Failed to create game.",
      resetPollFailed: "Failed to reset poll status.",
      checkFailed: "Failed to check game status.",
      openPollFailed: "Failed to open poll.",
    },
    hint: {
      select: "Select a game to enable actions.",
      selectPlus: "Select a game to enable actions and export options.",
    },
    editAfterPoll: {
      title: "Reset poll?",
      text: "This poll is already open or closed. Reset it to enable editing?",
      ok: "Reset",
      cancel: "Cancel",
    },
    gameFallback: "Untitled",
  },
  editor: {
    title: "Familiada — editor",
    backToGames: "← My games",
    logout: "Log out",
    pageTitle: "Editor",
    gameNamePlaceholder: "Game name",
    questionsTitle: "Questions",
    importHint: "Import works from a TXT file or pasted content.",
    importBtn: "Import",
    empty: "Select a question on the left or add a new one.",
    lockedPoll: "POLL OPEN — EDITING LOCKED",
    questionLabel: "Question text",
    answerLabel: "Answer",
    pointsLabel: "Pts",
    importModal: {
      title: "Import questions",
      subtitle:
        "You can <b>paste text</b> or <b>load a TXT file</b>. Optionally start with <b>@Game name</b>. Questions start with <b>#</b>. Answers can include numbers. Points after <b>/</b> are optional (polls may ignore them).",
      loadFile: "Load file",
      placeholder:
        "@My game\n#Animals in Africa\n1 Elephant /29\n2 Lion /19\n3 Monkey /16\n\n#Second question\n1 Answer 1\n2 Answer 2\n3 Answer 3",
      formatHint:
        "The format also works without numbers (just answer lines). Import tolerates spaces/tabs, “1.”, “2)” etc. Answers longer than 17 characters will be trimmed.",
      confirm: "Import",
      cancel: "Close",
    },
    defaultGameName: "New game",
    defaults: {
      question: "Question {ord}",
      answer: "ANS {ord}",
    },
    actions: {
      delete: "Delete",
      addQuestion: "Add question",
      addAnswer: "+ Add answer",
    },
    labels: {
      questionNumber: "Question {ord}",
      questionsOnly: "Questions only",
      answersSum: "{count}/{max} answers • sum {sum}/{sumMax}",
      answersCount: "{count}/{max} answers",
    },
    type: {
      pollText: "STANDARD POLL",
      pollPoints: "POINTS POLL",
      prepared: "PREPARED",
    },
    config: {
      pollText: {
        title: "Standard poll",
        hintTop: "Minimum {min} questions.",
        hintBottom: "Answers and points are not required.",
      },
      pollPoints: {
        title: "Points poll",
        hintTop: "Minimum {min} questions, each {answersMin}–{answersMax} answers.",
        hintBottom: "Points are ignored.",
      },
      prepared: {
        title: "Prepared",
        hintTop: "Minimum {min} questions, each {answersMin}–{answersMax} answers.",
        hintBottom: "Points sum ≤ {sum}.",
      },
    },
    status: {
      nameSaved: "Name saved.",
      nameSaveError: "Failed to save name.",
      addQuestionLimit: "Cannot add question — database constraint (questions.ord).",
      addQuestionError: "Error adding question (console).",
      questionAdded: "Question added.",
      questionDeleted: "Question deleted.",
      questionDeleteError: "Error deleting question (console).",
      answerAdded: "Answer added.",
      answerRemoved: "Answer removed.",
      answerAddError: "Error adding answer (console).",
      answerDeleteError: "Error deleting answer (console).",
      answerLimitReached: "Answer limit reached.",
      saveError: "Save error (console).",
      pointsRejected: "Error: points rejected by database (constraint).",
      pointsSaveError: "Error saving points (console).",
      saved: "Saved.",
      typing: "Typing…",
      answerLimit: "Answer limit: {limit}.",
      minQuestions: "Required minimum: {min} (you have {count})",
      minQuestionsOk: "Minimum met",
    },
    confirm: {
      resetPoll: "Reset poll status to edit?",
      deleteQuestion: "Delete this question and all its answers?",
      deleteAnswer: "Delete this answer?",
    },
    sumLabel: "SUM",
    import: {
      fileFailed: "Failed to read file.",
      pastePrompt: "Paste content or load a file.",
      formatError: "Invalid format.",
      confirm:
        "TXT import will REPLACE the game contents:\n\n- removes all existing questions and answers\n- loads data from text\n\nContinue?",
      cancelled: "Cancelled.",
      progress: {
        start: "Start…",
        cleanup: "Cleaning game",
        cleanupOk: "Cleaned",
        ok: "OK",
        question: "Question {ord}/{total}",
        answer: "Answer {ord}",
        answerOk: "Answer {ord} OK",
        createQuestionMsg: "Creating question…",
        createAnswerMsg: "Answer {ord}…",
        createAnswerOkMsg: "Answer {ord} OK",
        renumber: "Renumbering",
        statuses: "Counting statuses",
        render: "Rendering view",
        done: "Done ✅",
        errorStep: "Error ❌",
      },
      done: "Import finished.",
      replaced: "Imported (content replaced).",
      error: "Error: {error}",
      warningClose: "Close",
    },
    alert: {
      cannotEdit: "Cannot edit while poll is open.",
      editorError: "Editor error (console).",
    },
  },
  pollText: {
    title: "Familiada — poll",
    pollTitle: "Poll",
    loading: "Loading…",
    placeholder: "Enter an answer...",
    send: "Send",
    sendMobile: "OK",
    maxChars: "Maximum 17 characters.",
    thanks: "Thanks for participating!",
    loadTimeout: "Cannot load questions (timeout).",
    enterAnswer: "Enter an answer.",
    taskInvalid: "Link is invalid or inactive.",
    loginToVote: "Log in to proceed to voting.",
    emailRequired: "Provide the email from the invitation link.",
    openTaskFail: "Unable to open task.",
    pollFallback: "Poll",
    pollClosed: "The poll is closed. Thank you!",
    sending: "Sending…",
    error: "Error: {error}",
    questionProgress: "Question {current}/{total}",
    beforeUnloadWarn: "Your answers will not be counted.",
    missingParams: "Missing id or key parameter.",
    alreadyVoted: "You have already participated in this poll.",
    wrongType: "This is not a standard poll.",
    openPollFail: "Unable to open poll: {error}",
  },
  pollPoints: {
    title: "Familiada — poll",
    pollTitle: "Poll",
    loading: "Loading…",
    thanks: "Thanks for participating!",
    loadTimeout: "Cannot load questions (timeout).",
    taskInvalid: "Link is invalid or inactive.",
    loginToVote: "Log in to proceed to voting.",
    emailRequired: "Provide the email from the invitation link.",
    openTaskFail: "Unable to open task.",
    pollFallback: "Poll",
    pollClosed: "The poll is closed. Thank you!",
    sending: "Sending…",
    error: "Error: {error}",
    questionProgress: "Question {current}/{total}",
    beforeUnloadWarn: "Your answers will not be counted.",
    missingParams: "Missing id or key parameter.",
    alreadyVoted: "You have already participated in this poll.",
    wrongType: "This is not a points poll.",
    openPollFail: "Unable to open poll: {error}",
    answerFallback: "ANS {ord}",
  },
  pollGo: {
    title: "Familiada — invitation",
    loadingTitle: "Loading invitation…",
    loadingText: "Please wait.",
    emailPlaceholder: "Enter email",
    declined: "Declined",
    taskDeclined: "Task was declined.",
    error: "Error",
    declineTaskFailed: "Failed to decline task.",
    declineInviteFailed: "Failed to decline invitation.",
    subHeading: "Subscription invitation{owner}",
    taskHeading: "Voting invitation for {name}{owner}",
    taskName: "“{name}”",
    pollFallback: "poll",
    ownerSuffix: " from user {owner}",
    mismatch: "This invitation is not for you. Log in as {email} and try again.",
    inviteUsed: "Invitation has been used.",
    acceptFailed: "Failed to accept.",
    subscriptionActive: "Subscription active",
    inviteAccepted: "Invitation accepted.",
    inviteDeclined: "Invitation declined.",
    inviteAcceptFailed: "Failed to accept invitation.",
    emailMissingTitle: "Missing email",
    emailMissingText: "Enter a valid email address.",
    subscribeFailed: "Failed to subscribe.",
    subscribeAdded: "Subscription added.",
    subscriptionInviteActive: "Subscription invitation is active.",
    subscribePrompt: "Enter email if you want to subscribe.",
    acceptInHub: "To accept, go to the Polls hub.",
    hubLabel: "Polls hub",
    acceptLabel: "Accept",
    declineLabel: "Decline",
    subscribeLabel: "Subscribe",
    loginToAccept: "Log in to accept.",
    loginLabel: "Log in",
    loginToVote: "Log in to vote.",
    taskInviteActive: "Voting invitation is active.",
    voteLabel: "Vote",
    missingLinkTitle: "Missing link",
    missingLinkText: "Invitation token is missing.",
    invalidLinkTitle: "Invalid link",
    invalidLinkText: "The link is invalid or inactive.",
    inviteUnknown: "Unable to identify invitation.",
    openInviteFailed: "Unable to open invitation.",
    invitationRecipient: "invitation recipient",
  },
  pollQr: {
    title: "Familiada — QR",
    fullscreen: "Fullscreen",
    scan: "Scan the QR code to vote",
    missingUrl: "Missing URL",
    qrFailed: "Failed to generate QR",
  },
  pollsHub: {
    title: "Familiada — polls hub",
    backToGames: "← My games",
    logout: "Log out",
    header: {
      title: "Polls hub",
      hint: "Manage polls and voting invitations.",
    },
    tabs: {
      polls: "Polls",
      subscriptions: "Subscriptions",
      tasks: "Tasks",
      subscribersMobile: "Subs.",
      subscriptionsMobile: "Subs.",
    },
    sections: {
      myPolls: "My polls",
      selectHint: "Click a tile to select it.",
      tasks: "Tasks",
      tasksHint: "Double-click opens voting.",
      mySubscribers: "My subscribers",
      subscribersHint: "Invite new people and manage invitations.",
      mySubscriptions: "My subscriptions",
      subscriptionsHint: "Accept invitations from others.",
    },
    toggle: {
      current: "Current",
      archive: "Archive",
    },
    actions: {
      share: "Share",
      details: "Details",
      decline: "Decline",
      remove: "Remove",
      resend: "Resend invitation",
      cancel: "Cancel",
      accept: "Accept",
    },
    invite: {
      placeholder: "Email or username",
      button: "Invite",
    },
    share: {
      title: "Share poll",
      subtitle: "Choose subscribers you want to send the task to.",
      save: "Save share",
      close: "Close",
    },
    details: {
      title: "Voting details",
      titleWithName: "Voting details — {name}",
      subtitle: "Remove a vote linked to a task if needed.",
      voted: "Voted",
      pending: "Not voted",
      declined: "Declined",
      cancelled: "Cancelled",
      anon: "Anonymous",
      close: "Close",
    },
    progress: {
      title: "Processing",
      subtitle: "Please wait…",
      declineTask: "Declining task…",
      invite: "Inviting…",
      resend: "Resending invitation…",
      removeSubscriber: "Removing subscriber…",
      acceptSubscription: "Accepting subscription…",
      updateSubscription: "Updating subscription…",
      loadSubscribers: "Loading subscribers…",
      share: "Sharing…",
      loadDetails: "Loading details…",
      deleteVote: "Deleting vote…",
    },
    ok: "OK",
    errorLabel: "Error",
    pollType: {
      text: "Standard poll",
      points: "Points poll",
    },
    pollState: {
      open: "Open",
      closed: "Closed",
      draft: "Draft",
    },
    sort: {
      newest: "Newest",
      oldest: "Oldest",
      nameAsc: "Name A–Z",
      nameDesc: "Name Z–A",
      type: "Type",
      state: "State",
      tasksActive: "Most active tasks",
      tasksDone: "Most completed tasks",
      available: "Available only",
      done: "Completed only",
      nameEmailAsc: "Name/Email A–Z",
      nameEmailDesc: "Name/Email Z–A",
      status: "Status",
    },
    status: {
      active: "Active",
      pending: "Pending",
      declined: "Declined",
      cancelled: "Cancelled",
    },
    taskStatus: {
      done: "Done",
      available: "Available",
    },
    tasksBadgeLabel: "Tasks",
    tasksBadgeTitle: "Tasks: {done} of {total} shared have voted.",
    tasksBadgeNone: "Tasks: no shares.",
    anonBadgeLabel: "Anon",
    anonBadgeTitle: "Anonymous votes: {count}.",
    empty: {
      polls: "No polls to show.",
      tasks: "No tasks to show.",
      subscribers: "No subscribers.",
      subscriptions: "No subscriptions.",
      activeSubscribers: "No active subscribers.",
      tasksShort: "No tasks.",
      details: "No tasks.",
    },
    shareStatus: {
      done: "Done",
      active: "Available",
      declined: "Declined",
      cancelled: "Cancelled",
      missing: "None",
    },
    shareHint: {
      locked: "Locked",
      active: "Active",
      retry: "You can resend",
      cooldown: "You can retry in {hours}h.",
      missing: "None",
    },
    shareLockedHint: "Voted — remove vote to unlock.",
    shareStatusLabel: "Status",
    shareStatusMissing: "None",
    shareHintMissing: "None",
    errors: {
      mailSend: "Failed to send email.",
      mailSession: "No active session to send email.",
      declineTask: "Failed to decline task.",
      invalidEmail: "Invalid email.",
      unknownUser: "Unknown username.",
      invite: "Failed to invite.",
      resend: "Failed to resend invitation.",
      inviteMailFailed: "Invite saved, but email sending failed.",
      resendMailFailed: "Resend saved, but email sending failed.",
      removeSubscriber: "Failed to remove subscriber.",
      acceptSubscription: "Failed to accept invitation.",
      updateSubscription: "Failed to update subscription.",
      loadSubscribers: "Failed to load subscribers.",
      shareSave: "Failed to save share.",
      loadDetails: "Failed to load details.",
      deleteVote: "Failed to delete vote.",
      loadHub: "Failed to load polls hub data.",
    },
    statusMsg: {
      inviteSaved: "Invitation saved.",
      mailSending: "Sending email…",
      mailSent: "Email sent.",
      mailFailed: "Email was not sent.",
      shareNoChanges: "No changes to save.",
      shareSavedWithMail: "Share saved. Emails: {sent}/{total}.",
      shareSaved: "Share saved.",
      shareSavedMsg: "Share saved.",
      mailBatchSending: "Sending emails…",
      mailMarking: "Marking sent emails…",
    },
    modal: {
      removeSubscriber: {
        title: "Remove subscriber",
        text: "Are you sure you want to remove this subscriber?",
        ok: "Remove",
        cancel: "Cancel",
      },
      deleteVote: {
        title: "Delete vote",
        text: "Are you sure you want to delete this person's vote?",
        ok: "Delete",
        cancel: "Cancel",
      },
      tokenMismatch: {
        title: "Invitation does not match account",
        text: "This invitation belongs to a different email. Log out and sign in with the correct account to confirm it.",
        ok: "Log out",
        cancel: "Close",
      },
    },
    confirm: {
      focusTask: "You have a pending task. Go to voting?",
      focusSub: "You have a subscription invitation. Accept it?",
    },
    pollFallback: "poll",
    pollNameLabel: "“{name}”",
    ownerFallback: "Familiada user",
    mail: {
      subtitle: "Polls hub",
      subscriptionTitle: "Subscription invitation from {owner}",
      subscriptionBody:
        "User <strong>{owner}</strong> invites you to subscribe. Click the button to view the invitation.",
      subscriptionAction: "View invitation",
      taskTitle: "Voting invitation",
      taskSubject: "Voting invitation — {name}",
      taskBody: "User <strong>{owner}</strong> invites you to participate in {name}.",
      taskAction: "Go to voting",
      ignoreNote: "If this wasn't you, ignore this message.",
      linkHint: "Link not working? Copy and paste into your browser:",
      autoNote: "Automatic message — please do not reply.",
    },
    pollReadyAlert: "Finish the game in My games",
    resendCooldownAlert: "You can resend the invite in {hours}h.",
    shareCooldownAlert: "You can invite again in {hours}h.",
  },
  logoEditor: {
    title: "Familiada — logo editor",
    topbar: {
      backToGames: "← My games",
      logout: "Log out",
    },
    list: {
      title: "Your logos",
      hint: "Click a tile to select it.",
      preview: "Preview",
      activate: "Activate",
      export: "Export",
      import: "Import",
      delete: "Delete",
      deleteDisabled: "Can't delete",
      activeLabel: "Active",
    },
    editor: {
      nameLabel: "Name",
      namePlaceholder: "e.g. My logo",
      save: "Save",
      newLogoPrefix: "New logo — ",
    },
    modes: {
      text: "Text art",
      textPix: "Text",
      draw: "Drawing",
      image: "Image",
    },
    text: {
      placeholder: "e.g. FAMILIADA",
      allowedChars: "Allowed characters",
      allowedCharsHide: "Hide",
      invalidChars: "Invalid characters: {chars}",
      tooWide: "Text doesn't fit: width {width}/30.",
      widthStatus: "Width: {width}/30 ({status}).",
      fits: "fits",
      notFits: "doesn't fit",
      fixInvalidChars: "Fix invalid characters.",
      fixTooWide: "Text doesn't fit — shorten the text.",
    },
    textPix: {
      font: "Font",
      systemFont: "System",
      searchPlaceholder: "Search fonts…",
      searchClear: "Clear",
      emptyResults: "No results",
      size: "Size",
      lineHeight: "Line height",
      letterSpacing: "Spacing",
      paddingTop: "Top",
      paddingBottom: "Bottom",
      boldTitle: "Bold",
      italicTitle: "Italic",
      underlineTitle: "Underline",
      alignTitle: "Alignment",
      invert: "Invert (white background)",
      preview: "Preview",
      placeholder: "Enter text…",
      tooltips: {
        bold: "Bold",
        italic: "Italic",
        underline: "Underline",
        alignCycle: "Alignment (cycle)",
        alignCycleExtra: "Click: left → center → right",
      },
      errors: {
        fontsLoad: "Can't load fonts.json",
        fontsInvalid: "fonts.json is not an array",
        fontsLoadFailed: "Font loading error",
      },
      warnings: {
        clipped: "Looks clipped — reduce size or shorten the text.",
        screenshotFailed: "Can't capture the editor (check TinyMCE/html2canvas in HTML).",
      },
    },
    draw: {
      colors: {
        black: "black",
        white: "white",
      },
      aria: {
        strokeColor: "Stroke color: {color}",
        backgroundColor: "Stage background: {color}",
      },
      tooltips: {
        select: "Pointer (select / move)",
        pan: "Hand (pan)\nHold Space",
        zoomIn: "Zoom in",
        zoomOut: "Zoom out",
        color: "Tool color (stroke)",
        background: "Stage background (black/white)",
        brush: "Brush\nB",
        eraser: "Eraser\nE",
        line: "Line\nL",
        rect: "Rectangle\nR",
        ellipse: "Ellipse\nO",
        poly: "Polygon\nP",
        undo: "Undo",
        redo: "Redo",
        settings: "Tool settings",
        polyDone: "Finish polygon\nEnter / double click",
        clear: "Clear",
        preview: "Preview",
      },
      errors: {
        missingFabric: "Fabric.js is missing (script not loaded).",
      },
      tools: {
        brush: "Brush",
        eraser: "Eraser",
        line: "Line",
        rect: "Rectangle",
        ellipse: "Ellipse",
        poly: "Polygon",
        pan: "Hand",
        select: "Pointer",
      },
      noSettings: "This tool has no settings.",
      stroke: "Stroke width",
      fill: "Fill",
      fillColor: "Fill color",
      settingsTitle: "Settings — {tool}",
      confirmClear: "Clear everything?",
    },
    image: {
      pickImage: "Choose image 📁",
      brightness: "Brightness",
      contrast: "Contrast",
      gamma: "Gamma",
      black: "Black",
      white: "White",
      dither: "Dither",
      invert: "Invert",
      reset: "Reset",
      displayArea: "Display area",
      previewTitle: "Preview as on the display",
      previewHint: "Click the preview to open fullscreen.",
      brightnessValue: "Brightness: {value}",
      contrastValue: "Contrast: {value}",
      gammaValue: "Gamma: {value}",
      blackValue: "Black: {value}",
      whiteValue: "White: {value}",
      ditherValue: "Dither: {value}",
      loadError: "Couldn't load the image.",
    },
    create: {
      title: "New logo",
      subtitle: "Choose creation mode.",
      textTitle: "Text art",
      textSubtitle: "Font like the classic Familiada logo",
      textPixTitle: "Text",
      textPixSubtitle: "Text like in a text editor",
      drawTitle: "Drawing",
      drawSubtitle: "You can draw freely",
      imageTitle: "Image",
      imageSubtitle: "Import user images",
    },
    preview: {
      title: "Preview",
      subtitle: "This is how the logo will look on the display",
    },
    common: {
      close: "Close",
    },
    import: {
      title: "IMPORT…",
      subtitle: "Don't close the page. Import in progress.",
      steps: {
        readFile: "Reading file…",
        validate: "Checking JSON…",
        saveDb: "Saving to database…",
        refresh: "Refreshing list…",
      },
      messages: {
        validation: "Format validation",
        creatingRecord: "Creating new record",
        done: "Done",
      },
    },
    export: {
      title: "EXPORT…",
      subtitle: "Don't close the page. Preparing the file.",
      steps: {
        prepare: "Preparing data…",
        createFile: "Creating file…",
        download: "Downloading…",
      },
      messages: {
        browserPrompt: "The browser may ask to save",
      },
    },
    status: {
      saving: "Saving…",
      saved: "Saved.",
      updated: "Updated.",
      fixingName: "Fixing the name and saving again…",
      deleting: "Deleting…",
      deleted: "Deleted.",
      imported: "Logo imported.",
      settingActive: "Setting active…",
      activeSet: "Active set.",
    },
    errors: {
      saveFailed: "Can't save.",
      saveFailedDetailed: "Couldn't save.\n\n{error}",
      saveError: "Save error.",
      importFailedDetailed: "Couldn't import.\n\n{error}",
      exportFailedDetailed: "Couldn't export.\n\n{error}",
      setActiveFailedDetailed: "Couldn't set active.\n\n{error}",
      fontsLoad: "Couldn't load fonts. Check display/font_*.json paths.",
      invalidJson: "This is not valid JSON.",
      pixSize: "Wrong PIX size. Expected {expectedW}×{expectedH}, got {actualW}×{actualH}.",
      missingBits: "Missing bits_b64 in import.",
      unknownImportFormat:
        "Unknown import format. Expected kind=GLYPH or kind=PIX (or type containing GLYPH/PIX).",
      noUser: "No logged-in user.",
      invalidPixFormat: "Invalid PIX format.",
      unknownLogoFormat: "Unknown logo import format.",
      demoImportFiles: "demoImport4Logos requires exactly 4 files.",
      deleteFailed: "Couldn't delete.\n\n{error}",
    },
    defaults: {
      logoName: "Default logo",
      logoFileName: "logo",
      unnamed: "(unnamed)",
    },
    confirm: {
      closeUnsaved: "If you close now, changes won't be saved.",
      backUnsaved: "You have unsaved changes. Go back and lose them?",
      deleteLogo: "Delete logo “{name}”?",
      logoutUnsaved: "You have unsaved changes. Log out and lose them?",
    },
  },
  baseExplorer: {
    title: "Question base manager",
    headerTitle: "Question base manager",
    backToBases: "← My bases",
    logout: "Log out",
    common: {
      close: "Close",
      save: "Save",
      delete: "Delete",
      dash: "—",
    },
    defaults: {
      baseName: "Question base",
      folder: "Folder",
      tag: "tag",
      question: "Question",
    },
    search: {
      placeholder: "Search...",
      clear: "Clear",
    },
    toolbar: {
      groupCreate: "Create",
      newFolder: "New folder",
      newQuestion: "New question",
      groupEdit: "Edit",
      editQuestion: "Edit question",
      editTags: "Tags",
      rename: "Rename",
      delete: "Delete",
      groupClipboard: "Clipboard",
      copy: "Copy",
      cut: "Cut",
      paste: "Paste",
      duplicate: "Duplicate",
      groupGame: "Game",
      createGame: "Create game",
      groupView: "View",
      refreshView: "Refresh view",
    },
    tree: {
      toggle: "Expand/collapse",
      root: "Root folder",
      folders: "Folders",
      empty: "No folders.",
    },
    tags: {
      modalTitle: "Tags",
      addTag: "+ Add tag",
      editTitle: "Tag",
      namePlaceholder: "Tag name…",
      pickColor: "Pick color",
      colorLabel: "Color",
      colorModalTitle: "Color",
      colorPreview: "Color preview",
      hexLabel: "HEX",
      hexHint: "Format: <b>#RRGGBB</b>",
      header: "Tags",
      metaHeader: "Matching categories",
      empty: "No tags.",
      selectionQuestions: "{count} q.",
      selectionFolders: "{count} folder(s)",
      selectionSummary: "Selection: {items}.",
      selectionEmpty: "No selection.",
      partialWarning: "This tag is partially assigned. Clicking will set: all.",
      partial: "partial",
      editModeTitle: "Edit tag",
      createModeTitle: "New tag",
      editModeHelp: "Change the tag name and color.",
      createModeHelp: "Add a new tag.",
      errors: {
        noSpaces: "The name cannot contain spaces. Use _ instead.",
        allowedChars: "Allowed characters: letters, digits, and _",
        duplicate: "This tag already exists. Choose another name.",
        saveAssignFailed: "Failed to save tags.",
        saveFailed: "Failed to save tag.",
      },
    },
    rename: {
      title: "Rename",
      help: "Enter a new name and save.",
      folderTitle: "Rename folder",
      questionTitle: "Rename question text",
    },
    export: {
      title: "Export game",
      subtitle:
        "Pick at least 10 questions. Red ones don't meet the selected type requirements — uncheck them or fix the data.",
      gameNameLabel: "Game name",
      questionsLabel: "Questions",
      typeTitle: "Game type",
      typePollText: "Standard poll",
      typePollPoints: "Scored",
      typePrepared: "Prepared",
      selectedTitle: "Selected (min 10)",
      selectedLabel: "SELECTED",
      create: "Create",
      defaultGameName: "game",
      typeHintPollText: "10+ questions, no answer requirements.",
      typeHintPollPoints: "10+ questions, each 3–6 answers.",
      typeHintPrepared: "10+ questions, 3–6 answers, total points ≤ 100.",
      answersCount: "{count} ans.",
      noAnswers: "no answers",
      preparedSummary: "{count} ans. • total {sum}",
      errors: {
        minQuestions: "You need at least {count} questions to export.",
        pickMin: "Select at least {count} questions.",
        createFailed: "Failed to create the game (see progress bar / console for details).",
      },
      progress: {
        creatingGame: "Creating game…",
        exporting: "Exporting…",
        done: "Done ✅",
        created: "Game created.",
        error: "Error ❌",
        errorDetail: "Error: {error}",
        importingQuestions: "Importing questions…",
        importDone: "Import complete",
        importOk: "OK",
      },
    },
    question: {
      title: "Question",
      subtitle:
        "Edit a single question. Max 6 answers. Points optional.\n        If set: 0–100, total ≤ 100.",
      textLabel: "Question text",
      textPlaceholder: "Enter question text…",
      answerHeader: "Answer",
      pointsHeader: "Points",
      addAnswer: "+ Answer",
      sumTitle: "Points sum (max 100)",
      sumLabel: "SUM",
      answerPlaceholder: "Answer…",
      pointsPlaceholder: "(optional)",
      errors: {
        maxAnswers: "Max 6 answers.",
        pointsRange: "Points must be between 0–100 (if set).",
        sumExceeded: "Points total cannot exceed 100.",
      },
    },
    list: {
      colNumber: "No",
      colName: "Name",
      colType: "Type",
      colDate: "Date",
      colInfo: "Info",
      folderType: "Folder",
      folderCount: "{count} items",
      questionType: "Question",
      answerCount: "{count} ans.",
      empty: "No items.",
      resizeColumn: "Drag to resize column",
    },
    menu: {
      show: "Show",
      addTag: "Add tag…",
      editTag: "Edit tag…",
      delete: "Delete",
      deleteTag: "Delete tag",
      deleteTags: "Delete tags",
      newFolder: "New folder",
      newQuestion: "New question",
      copy: "Copy",
      cut: "Cut",
      paste: "Paste",
      duplicate: "Duplicate",
      tags: "Tags…",
      openFolder: "Open folder",
      newFolderIn: "New folder in this folder",
      newQuestionIn: "New question in this folder",
      editQuestion: "Edit question…",
      rename: "Rename",
      renameQuestion: "Rename (text)",
      createGame: "Create game…",
    },
    meta: {
      prepared: "prepared",
      pollPoints: "scored",
      pollText: "standard",
    },
    errors: {
      missingBaseId: "Missing base identifier.",
      noAccess: "No access to this base.",
      loadFailed: "Failed to load the base (check console).",
      deleteTagsFailed: "Failed to delete tags.",
      duplicateFailed: "Failed to duplicate.",
      operationFailed: "Operation failed.",
      rootDeleteBlocked: "The root folder cannot be deleted.",
      renameFailed: "Rename failed.",
      moveIntoSelf: "You cannot move a folder into itself.",
      moveIntoChild: "You cannot move a folder into its subfolder.",
      selectItemsRight: "Select folders or questions on the right.",
      noTagsSelected: "No tags selected.",
      rootInOperation: "The root folder cannot be part of this operation.",
      actionFailed: "Action failed.",
      assignTagFailed: "Failed to assign tag.",
      moveFailed: "Move failed.",
      questionOpenSaveFailed: "Failed to open/save the question.",
      missingUserId: "Missing userId — cannot create a game.",
      exportModalMissing: "Error: export modal is not initialized.",
      createGameFailed: "Failed to create a game.",
      deleteInSearch: "You cannot delete in search view.",
      removeTagsFailed: "Failed to remove tags.",
      deleteFailed: "Delete failed.",
      pasteInSearch: "You cannot paste in search view.",
      pasteInTag: "You cannot paste in tag view.",
      pasteFailed: "Paste failed.",
      createQuestionFailed: "Failed to create question.",
      createFolderFailed: "Failed to create folder.",
      treeLockedSearch:
        "While searching, the tree is locked. Click ✕ to clear, or click outside the search field.",
      treeLockedSelection:
        "You have Tags/Categories selected. Clear the selection on the left (click the panel background) to use the tree.",
      tagsLockedSearch:
        "While searching, the Tags/Categories panel is locked. Click ✕ to clear, or click outside the search field.",
      searchLockedSelection:
        "You have Tags/Categories selected — search is locked. Clear the selection on the left (click the panel background) to search.",
    },
    confirm: {
      deleteItems: "Delete {label}? This cannot be undone.",
      deleteTags:
        "Delete {label}?\n\nThis will also remove tag assignments from questions (and possibly folders).",
      removeTagsInTagView:
        "You are in tag view.\n\nWe will remove tags (without deleting items) on {label}.\n\nContinue?",
    },
  },
};

export default en;
