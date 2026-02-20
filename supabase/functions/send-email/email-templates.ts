export type EmailLang = "pl" | "en" | "uk";
export type EmailType = "signup" | "guest_migrate" | "recovery" | "email_change";

type CopyBlock = {
  subtitle: string;
  title: string;
  desc: string;
  btn: string;
  ignore: string;
  copyHint: string;
  linkLabel?: string;
  footer: string;
};

type CopyMap = Record<EmailType, Record<EmailLang, CopyBlock>>;

export const EMAIL_COPY: CopyMap = {
  signup: {
    pl: {
      subtitle: "Potwierdzenie konta",
      title: "Aktywuj konto",
      desc: "Kliknij przycisk poniżej, aby potwierdzić adres e-mail i dokończyć rejestrację.",
      btn: "POTWIERDŹ KONTO",
      ignore: "Jeśli to nie Ty, zignoruj tę wiadomość.",
      copyHint: "Link nie działa? Skopiuj i wklej do przeglądarki:",
      linkLabel: "Link nie działa?",
      footer: "Wiadomość automatyczna — prosimy nie odpowiadać.",
    },
    en: {
      subtitle: "Account confirmation",
      title: "Activate your account",
      desc: "Click the button below to confirm your email address and complete registration.",
      btn: "CONFIRM ACCOUNT",
      ignore: "If this wasn’t you, you can safely ignore this email.",
      copyHint: "Link not working? Copy and paste it into your browser:",
      linkLabel: "Link not working?",
      footer: "This is an automated message — please do not reply.",
    },
    uk: {
      subtitle: "Підтвердження облікового запису",
      title: "Активуйте обліковий запис",
      desc: "Натисніть кнопку нижче, щоб підтвердити електронну пошту та завершити реєстрацію.",
      btn: "ПІДТВЕРДИТИ ОБЛІКОВИЙ ЗАПИС",
      ignore: "Якщо це не ви, просто проігноруйте цей лист.",
      copyHint: "Посилання не працює? Скопіюйте та вставте в браузер:",
      linkLabel: "Посилання не працює?",
      footer: "Автоматичне повідомлення — будь ласка, не відповідайте.",
    },
  },
  guest_migrate: {
    pl: {
      subtitle: "Migracja konta",
      title: "Potwierdź migrację",
      desc: "Kliknij przycisk poniżej, aby potwierdzić adres e-mail i przenieść konto gościa.",
      btn: "POTWIERDŹ MIGRACJĘ",
      ignore: "Jeśli to nie Ty, zignoruj tę wiadomość.",
      copyHint: "Link nie działa? Skopiuj i wklej do przeglądarki:",
      linkLabel: "Link nie działa?",
      footer: "Wiadomość automatyczna — prosimy nie odpowiadać.",
    },
    en: {
      subtitle: "Account migration",
      title: "Confirm migration",
      desc: "Click the button below to confirm your email and migrate the guest account.",
      btn: "CONFIRM MIGRATION",
      ignore: "If this wasn’t you, you can safely ignore this email.",
      copyHint: "Link not working? Copy and paste it into your browser:",
      linkLabel: "Link not working?",
      footer: "This is an automated message — please do not reply.",
    },
    uk: {
      subtitle: "Міграція акаунта",
      title: "Підтвердіть міграцію",
      desc: "Натисніть кнопку нижче, щоб підтвердити e-mail і перенести гостьовий акаунт.",
      btn: "ПІДТВЕРДИТИ МІГРАЦІЮ",
      ignore: "Якщо це не ви, просто проігноруйте цей лист.",
      copyHint: "Посилання не працює? Скопіюйте та вставте в браузер:",
      linkLabel: "Посилання не працює?",
      footer: "Автоматичне повідомлення — будь ласка, не відповідайте.",
    },
  },
  recovery: {
    pl: {
      subtitle: "Reset hasła",
      title: "Ustaw nowe hasło",
      desc: "Otrzymaliśmy prośbę o zmianę hasła. Kliknij przycisk poniżej, aby ustawić nowe.",
      btn: "USTAW NOWE HASŁO",
      ignore: "Jeśli to nie Ty — zignoruj tę wiadomość. Hasło nie zmieni się, dopóki nie użyjesz linku.",
      copyHint: "Link nie działa? Skopiuj i wklej do przeglądarki:",
      footer: "Wiadomość automatyczna — prosimy nie odpowiadać.",
    },
    en: {
      subtitle: "Password reset",
      title: "Set a new password",
      desc: "We received a request to reset your password. Click the button below to set a new one.",
      btn: "SET NEW PASSWORD",
      ignore: "If this wasn’t you, you can safely ignore this email. Your password won’t change unless you use the link.",
      copyHint: "Link not working? Copy and paste it into your browser:",
      footer: "This is an automated message — please do not reply.",
    },
    uk: {
      subtitle: "Скидання пароля",
      title: "Встановіть новий пароль",
      desc: "Ми отримали запит на зміну пароля. Натисніть кнопку нижче, щоб встановити новий пароль.",
      btn: "ВСТАНОВИТИ НОВИЙ ПАРОЛЬ",
      ignore: "Якщо це були не ви — просто проігноруйте цей лист. Пароль не зміниться, доки ви не використаєте посилання.",
      copyHint: "Посилання не працює? Скопіюйте та вставте в браузер:",
      footer: "Автоматичне повідомлення — будь ласка, не відповідайте.",
    },
  },
  email_change: {
    pl: {
      subtitle: "Zmiana e-mail",
      title: "Potwierdź nowy adres",
      desc: "Kliknij poniżej, aby potwierdzić nowy adres e-mail przypisany do Twojego konta.",
      btn: "Potwierdź nowy e-mail",
      ignore: "Jeśli to nie Ty zmieniałeś(aś) adres — zignoruj i zabezpiecz konto.",
      copyHint: "Link nie działa? Skopiuj i wklej do przeglądarki:",
      footer: "Wiadomość automatyczna — prosimy nie odpowiadać.",
    },
    en: {
      subtitle: "Email change",
      title: "Confirm your new email",
      desc: "Click below to confirm the new email address associated with your account.",
      btn: "Confirm new email",
      ignore: "If you didn’t request this change, ignore this email and secure your account.",
      copyHint: "Link not working? Copy and paste it into your browser:",
      footer: "This is an automated message — please do not reply.",
    },
    uk: {
      subtitle: "Зміна e-mail",
      title: "Підтвердіть нову адресу",
      desc: "Натисніть нижче, щоб підтвердити нову електронну адресу, прив’язану до вашого облікового запису.",
      btn: "Підтвердити нову адресу",
      ignore: "Якщо це були не ви — проігноруйте лист і захистіть обліковий запис.",
      copyHint: "Посилання не працює? Скопіюйте та вставте в браузер:",
      footer: "Автоматичне повідомлення — будь ласка, не відповідайте.",
    },
  },
};

export function getEmailCopy(type: EmailType, lang: EmailLang): CopyBlock {
  return EMAIL_COPY[type][lang];
}
