-- Minimal deterministic development/reference data. No sample articles or media.

select set_config('subtext.suppress_audit', 'on', false);

insert into public.pillars (id, name, slug, description, sort_order)
values
  ('10000000-0000-4000-8000-000000000001', 'History', 'history', 'Empires, kings, heritage, archaeology, and sacred places.', 10),
  ('10000000-0000-4000-8000-000000000002', 'Business', 'business', 'Companies, business models, brand stories, and economics.', 20),
  ('10000000-0000-4000-8000-000000000003', 'Psychology', 'psychology', 'Human behaviour, consumer psychology, and cognitive biases.', 30),
  ('10000000-0000-4000-8000-000000000004', 'Society', 'society', 'Important current developments examined without daily-news churn.', 40)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.categories (id, pillar_id, name, slug, sort_order)
values
  ('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Empires', 'empires', 10),
  ('11000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Kings', 'kings', 20),
  ('11000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Heritage', 'heritage', 30),
  ('11000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'Archaeology', 'archaeology', 40),
  ('11000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'Sacred Places', 'sacred-places', 50),
  ('12000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Companies', 'companies', 10),
  ('12000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Business Models', 'business-models', 20),
  ('12000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'Brand Stories', 'brand-stories', 30),
  ('12000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'Economics', 'economics', 40),
  ('13000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'Human Behaviour', 'human-behaviour', 10),
  ('13000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'Consumer Psychology', 'consumer-psychology', 20),
  ('13000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'Cognitive Biases', 'cognitive-biases', 30)
on conflict (id) do update set
  pillar_id = excluded.pillar_id,
  name = excluded.name,
  slug = excluded.slug,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.site_settings (key, value, is_public, description)
values
  ('brand.name', '"Subtext Media"'::jsonb, true, 'Public publication name.'),
  ('brand.tagline', '"Everything has a subtext."'::jsonb, true, 'Public brand philosophy.')
on conflict (key) do update set
  value = excluded.value,
  is_public = excluded.is_public,
  description = excluded.description;

select set_config('subtext.suppress_audit', 'off', false);
