-- Formaty kolorów tagów (liczby wg wzorca) przed walidacją koloru po stronie serwera.
select
  count(*) filter (where color ~ '^#[0-9A-Fa-f]{6}$') as hex6,
  count(*) filter (where color ~ '^#[0-9A-Fa-f]{3}$') as hex3,
  count(*) filter (where color ~ '^#[0-9A-Fa-f]{8}$') as hex8,
  count(*) filter (where color ~* '^rgba?[(]') as rgb,
  count(*) filter (where color ~* '^hsla?[(]') as hsl,
  count(*) filter (where color ~* '^[a-z]+$') as named,
  count(*) filter (where color ~* '^var[(]') as css_var,
  count(*) filter (where color is null) as nulls,
  count(*) filter (where color = '') as empty,
  count(*) as total,
  min(char_length(color)) as min_len, max(char_length(color)) as max_len
from public.qb_tags
