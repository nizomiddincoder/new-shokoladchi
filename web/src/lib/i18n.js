// Oddiy i18n: kalitlar o'zbekcha (lotin) matnlar.
// Rus tili qo'shilganda RU lug'atiga to'ldiriladi — komponentlar o'zgarmaydi.
let lang = 'uz';

const DICT = {
  uz: {},
  ru: {}, // Keyingi bosqichda to'ldiriladi
};

export function setLang(l) { lang = DICT[l] ? l : 'uz'; }
export function getLang() { return lang; }

// t("Bosh sahifa") — tarjima bo'lsa qaytaradi, bo'lmasa kalitni o'zi qaytadi
export function t(key) {
  return DICT[lang][key] ?? key;
}
