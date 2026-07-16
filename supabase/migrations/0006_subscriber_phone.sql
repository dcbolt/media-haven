-- Optional phone capture (text alerts for night launches) and a source tag
-- so capture channels can be compared: 'portal' (launch alerts card),
-- 'wifi' (password-reveal gate).

alter table guest_subscribers
  add column phone text;
