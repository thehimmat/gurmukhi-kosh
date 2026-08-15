-- 026: word_forms.inflection_desc missed migration 023's nominative->direct
-- rename (issue #56). The column is a denormalized label built from the same
-- analysis as word_grammar.gram_case; the app now derives labels live from
-- the form's ending, but the stored copy must not keep serving the
-- pre-rename value to any other reader.
update word_forms
set inflection_desc = replace(inflection_desc, 'nominative', 'direct')
where inflection_desc like '%nominative%';
