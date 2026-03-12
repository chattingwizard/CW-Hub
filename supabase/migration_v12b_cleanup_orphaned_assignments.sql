-- Cleanup: delete model/chatter/override assignments pointing to inactive groups
DELETE FROM public.assignment_group_models
WHERE group_id IN (SELECT id FROM public.assignment_groups WHERE active = false);

DELETE FROM public.assignment_group_chatters
WHERE group_id IN (SELECT id FROM public.assignment_groups WHERE active = false);

DELETE FROM public.assignment_group_overrides
WHERE group_id IN (SELECT id FROM public.assignment_groups WHERE active = false);
