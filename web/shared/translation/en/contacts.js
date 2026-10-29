// Tłumaczenia EN — część „contacts”.
const en = {
  contacts: {
    load: {  failed: "Could not load contacts.", retry: "Retry" },
    tabs: { invite: "Invitations" },
    "friends": {
        "add": "Add a friend",
        "title": "Friends",
        "hint": "Invitations and people you are friends with.",
        },
    "subscribers": {
        "add": "Add a subscriber",
        "title": "Subscribers",
        "hint": "People without an account who want to receive your polls.",
        },
    "invite": "Invite",
    "handle": "Email or username",
    "email": "Email address",
    "go": "Go",
    "sent": "Invitation saved.",
    "mailFailed": "Invitation saved, but the email could not be sent. You can resend it.",
    "accountCreated": "Has an account — go to Friends.",
    "sections": {"declined": "Declined", "incoming": "Suggestions", "outgoing": "Pending", "friend": "Friends", "pending": "Pending", "active": "Subscribers"},
    "status": {"pending": "Pending", "active": "Accepted", "declined": "Declined"},
    "empty": {"incoming": "No new suggestions.", "outgoing": "No sent invitations.", "friend": "No friends yet.", "pending": "No pending invitations.", "active": "No subscribers yet."},
    "actions": {
        "undo_reject": "Undo decline",
        "accept": "Accept",
        "reject": "Decline",
        "cancel": "Withdraw",
        "remove": "Remove",
        "resend": "Resend"
    },
    "confirm": {
        "reject": "Decline this invitation?",
        "cancel": "Withdraw this invitation?",
        "remove": "Remove this person? Pending invitations and tasks will be deleted. Accepted bases and devices remain — you can revoke them separately.",
        "removeSubscriber": "Remove this subscriber? Their pending tasks from you will be deleted. A friend invitation, if they received one, stays."
    },
    "errors": {
        "alreadyFriend": "This person is already your friend.",
        "incomingPending": "You have a pending request from this person. Check Suggestions.",
        "outgoingPending": "Your invitation to this person is already awaiting a response.",
        "ownDeclined": "You declined this request. You can undo it in Declined.",
        "declined": "This person declined the invitation. You cannot send another one yet.",

        "hasAccount": "This email belongs to a Familijna account — you can invite this person as a friend.",
        "emailOnly": "This email has no Familijna account — you can add this person as a subscriber.",
        "cooldown": "You can send another invitation after: {date}.",
        "already": "This person is already on the list.",
        "action": "The action failed.",
        "self": "You can't invite yourself.",
        "unknownUser": "There is no account with this username. Enter the full username or an email address.",
        "invalidEmail": "Enter a valid email address.",
        "notificationsDisabled": "This person has opted out of all Familijna messages — they can't be invited."
    },
    "mail": {
        "friendTitle": "{owner} invites you to be friends on Familijna",
        "friendBody": "{owner} wants to add you as a friend. Accept the invitation on Familijna.",
        "friendAction": "Open invitation"
    },
    "goFriends": "Go to Friends",
    "goAccountBody": "The recipient has a Familijna account. Account invitations are managed in Friends.",
    "goTitle": "Friend invitation",
    "goBody": "{owner} invites you to be friends.",
    "open": "Open Friends",
    "friendMailDisabled": "Access granted. This person has opted out of email notifications.",
  },
};

export default en;
