// Tłumaczenia PL — część „contacts”.
const pl = {
  contacts: {
    load: {  failed: "Nie udało się wczytać kontaktów.", retry: "Ponów" },
    tabs: { invite: "Zaproszenia" },
    "friends": {
        "add": "Dodaj znajomego",
        "title": "Znajomi",
        "hint": "Zaproszenia i osoby, z którymi masz dwustronną znajomość.",
        },
    "subscribers": {
        "add": "Dodaj subskrybenta",
        "title": "Subskrybenci",
        "hint": "Osoby bez konta, które chcą otrzymywać Twoje ankiety.",
        },
    "invite": "Zaproś",
    "handle": "E-mail lub nazwa użytkownika",
    "email": "Adres e-mail",
    "go": "Przejdź",
    "sent": "Zaproszenie zapisane.",
    "mailFailed": "Zaproszenie zapisane, ale nie udało się wysłać maila. Możesz ponowić wysyłkę.",
    "accountCreated": "Ma konto — przejdź do Znajomych.",
    "sections": {"declined": "Odrzucone", "incoming": "Propozycje", "outgoing": "Oczekujące", "friend": "Znajomi", "pending": "Oczekujące", "active": "Subskrybenci"},
    "status": {"pending": "Oczekuje", "active": "Zaakceptowano", "declined": "Odrzucono"},
    "empty": {"incoming": "Nie masz nowych propozycji.", "outgoing": "Nie masz wysłanych zaproszeń.", "friend": "Nie masz jeszcze znajomych.", "pending": "Nie masz oczekujących zaproszeń.", "active": "Nie masz jeszcze subskrybentów."},
    "actions": {
        "undo_reject": "Cofnij odmowę",
        "accept": "Przyjmij",
        "reject": "Odrzuć",
        "cancel": "Cofnij",
        "remove": "Usuń",
        "resend": "Wyślij ponownie"
    },
    "confirm": {
        "reject": "Odrzucić zaproszenie?",
        "cancel": "Cofnąć zaproszenie?",
        "remove": "Usunąć tę osobę? Oczekujące zaproszenia i zadania zostaną usunięte. Przyjęte bazy i urządzenia zostają — można je cofnąć osobno.",
        "removeSubscriber": "Usunąć tego subskrybenta? Jego oczekujące zadania od Ciebie zostaną usunięte. Zaproszenie do znajomych, jeśli je dostał, zostaje."
    },
    "errors": {
        "alreadyFriend": "Ta osoba jest już Twoim znajomym.",
        "incomingPending": "Masz oczekującą prośbę od tej osoby. Sprawdź Propozycje.",
        "outgoingPending": "Zaproszenie do tej osoby już oczekuje na odpowiedź.",
        "ownDeclined": "Odrzuciłeś tę prośbę. Możesz cofnąć odmowę w sekcji Odrzucone.",
        "declined": "Ta osoba odrzuciła zaproszenie. Nie można teraz wysłać kolejnego.",

        "hasAccount": "Do tego maila jest przypisane konto w systemie Familijna — możesz zaprosić tę osobę do znajomych.",
        "emailOnly": "Do tego maila nie jest przypisane konto w systemie Familijna — możesz dodać tę osobę jako subskrybenta.",
        "cooldown": "Kolejne zaproszenie można wysłać po: {date}.",
        "already": "Ta osoba jest już na liście.",
        "action": "Nie udało się wykonać akcji.",
        "self": "Nie możesz zaprosić samego siebie.",
        "unknownUser": "Nie ma konta o takiej nazwie użytkownika. Wpisz pełną nazwę albo adres e-mail.",
        "invalidEmail": "Wpisz poprawny adres e-mail.",
        "notificationsDisabled": "Ta osoba zrezygnowała ze wszystkich wiadomości Familijnej — nie można jej zaprosić."
    },
    "mail": {
        "friendTitle": "{owner} zaprasza Cię do znajomych w Familijnej",
        "friendBody": "{owner} chce dodać Cię do znajomych. Przyjmij zaproszenie w Familijnej.",
        "friendAction": "Otwórz zaproszenie"
    },
    "goFriends": "Przejdź do Znajomych",
    "goAccountBody": "Odbiorca ma konto w Familijnej. Zaproszenia dla kont obsługujesz w Znajomych.",
    "goTitle": "Zaproszenie do znajomych",
    "goBody": "{owner} zaprasza Cię do znajomych.",
    "open": "Otwórz Znajomych",
    "friendMailDisabled": "Udostępniono. Ta osoba zrezygnowała z powiadomień e-mail.",
  },
};

export default pl;
