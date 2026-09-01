/**
 * Единый вид группы иконочных кнопок: пилюля дока действий, кластер действий
 * сообщения и всё, что появится дальше. Заводить свою поверхность под каждый
 * кластер нельзя — именно так кнопки над сообщением получили модальный чип с
 * тенью и стали выглядеть чужеродно рядом с плоским доком.
 */
export const ICON_CLUSTER_CLASS =
  "flex items-center gap-0.5 rounded-full bg-background p-0.5 ring-1 ring-border ring-inset";

/** Поверхность даёт кластер, поэтому у кнопки внутри своей заливки нет. */
export const ICON_CLUSTER_BUTTON_CLASS = "rounded-full hover:bg-surface";
