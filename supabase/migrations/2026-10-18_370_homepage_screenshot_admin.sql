-- Default editable examples for the admin screenshot gallery and public image bucket.
INSERT INTO public.app_config (key, value, note)
VALUES (
  'homepage_screenshot_fixtures_v1',
  $fixtures${
    "schemaVersion": 1,
    "languages": ["pl", "en", "uk"],
    "scenes": [
      {"id":"games","title":"Moje gry — Preparowane","path":"/games/","width":1440,"height":900,"fixture":{"game":"Rodzinny pojedynek","games":["Rodzinny pojedynek","Pytania na rodzinny wieczór","Wakacyjne skojarzenia"]}},
      {"id":"game-editor","title":"Edycja gry","path":"/games/editor/","width":1440,"height":900,"fixture":{"game":"Rodzinny pojedynek","question":"Podaj coś, co można zjeść na szybko","answers":["Kanapka","Owoc","Jogurt","Sałatka","Drożdżówka","Baton"],"points":[39,24,16,9,7,5]}},
      {"id":"bases","title":"Bazy pytań","path":"/bases/","width":1440,"height":900,"fixture":{"bases":["Pytania na rodzinny wieczór","Wakacyjne skojarzenia","Pytania dla znajomych"]}},
      {"id":"base-explorer","title":"Eksplorator bazy","path":"/bases/explorer/","width":1440,"height":900,"fixture":{"base":"Pytania na rodzinny wieczór","folders":["Na rozgrzewkę","Codzienne wybory","Czas wolny"],"questions":["Co zabierasz na weekendowy wyjazd?","Co pijesz rano?","Co robisz w wolny dzień?"]}},
      {"id":"friends","title":"Znajomi","path":"/friends/","width":1440,"height":900,"fixture":{"people":[{"name":"Aleksandra Nowak","state":"accepted"},{"name":"Jan Kowalski","state":"pending"},{"name":"Marta Zielińska","state":"rejected"}]}},
      {"id":"subscribers","title":"Subskrybenci","path":"/subscribers/","width":1440,"height":900,"fixture":{"people":[{"name":"Anna Nowak","state":"active"},{"name":"Piotr Zieliński","state":"active"},{"name":"Kasia Maj","state":"pending"}]}},
      {"id":"tasks","title":"Zadania","path":"/tasks/","width":1440,"height":900,"fixture":{"tasks":[{"game":"Weekendowy wyjazd","state":"done"},{"game":"Rodzinny pojedynek","state":"pending"}]}},
      {"id":"poll-share","title":"Udostępnianie ankiety","path":"/polls/","width":1440,"height":900,"fixture":{"poll":"Weekendowy wyjazd","question":"Co zabierasz na weekendowy wyjazd?","subscribers":["Anna Nowak","Piotr Zieliński","Kasia Maj"]}},
      {"id":"poll-vote-mobile","title":"Głosowanie anonimowe — telefon","path":"/polls/vote/points/","width":390,"height":844,"fixture":{"poll":"Weekendowy wyjazd","question":"Co zabierasz na weekendowy wyjazd?","answers":["Wygodne ubrania","Dobre jedzenie","Aparat","Książkę"]}},
      {"id":"poll-results","title":"Głosy i wyniki ankiety","path":"/polls/","width":1440,"height":900,"fixture":{"poll":"Weekendowy wyjazd","question":"Co zabierasz na weekendowy wyjazd?","answers":[{"text":"Wygodne ubrania","votes":8},{"text":"Dobre jedzenie","votes":5},{"text":"Aparat","votes":3},{"text":"Książkę","votes":2}]}},
      {"id":"appearance","title":"Ustawienia wyglądu","path":"/games/settings/","width":1440,"height":900,"fixture":{"game":"Rodzinny pojedynek","logo":"FAMILIADA"}},
      {"id":"sound","title":"Ustawienia dźwięku","path":"/games/settings/","width":1440,"height":900,"fixture":{"game":"Rodzinny pojedynek"}},
      {"id":"logos","title":"Biblioteka logo","path":"/logo/","width":1440,"height":900,"fixture":{"logos":[{"name":"FAMILIADA","file":"/shared/data/logo_familiada.json"},{"name":"Logo tekstowe","file":"/settings/data/screenshots/logo-text.json"},{"name":"Logo rysunkowe","file":"/settings/data/screenshots/logo-draw.json"}]}},
      {"id":"logo-draw","title":"Edytor rysunku","path":"/logo/editor/draw/","width":1440,"height":900,"fixture":{"logo":"Logo rysunkowe","logoFile":"/settings/data/screenshots/logo-draw.json"}},
      {"id":"control-round","title":"Panel sterowania — runda","path":"/control/","width":1440,"height":900,"fixture":{"game":"Rodzinny pojedynek","question":"Podaj coś, co można zjeść na szybko","teams":["Króliczki","Zajączki"],"answers":["Kanapka","Owoc","Jogurt","Sałatka","Drożdżówka","Baton"],"revealed":[1,3],"scores":[62,47]}},
      {"id":"host-round","title":"Prowadzący — runda","path":"/control/host/","width":1440,"height":900,"fixture":{"game":"Rodzinny pojedynek","question":"Podaj coś, co można zjeść na szybko","teams":["Króliczki","Zajączki"],"answers":["Kanapka","Owoc","Jogurt","Sałatka","Drożdżówka","Baton"],"revealed":[1,3],"scores":[62,47]}},
      {"id":"display-round","title":"Wyświetlacz — runda","path":"/control/display/","width":1440,"height":900,"fixture":{"game":"Rodzinny pojedynek","question":"Podaj coś, co można zjeść na szybko","teams":["Króliczki","Zajączki"],"answers":["Kanapka","Owoc","Jogurt","Sałatka","Drożdżówka","Baton"],"revealed":[1,3],"scores":[62,47]}},
      {"id":"control-finale","title":"Panel sterowania — finał","path":"/control/","width":1440,"height":900,"fixture":{"game":"Rodzinny pojedynek","finale":["Co zabierasz na weekend?","Jaki napój wybierasz?","Co pomaga odpocząć?","Co masz w plecaku?","Jaki smak lodów?"],"answers":["Ubrania","Herbata","Spacer","Mapa","Wanilia"]}},
      {"id":"main-display","title":"Główny Wyświetlacz","path":"/control/display/","width":1600,"height":900,"fixture":{"teams":["FAMILIADA","ONLINE"],"question":"TWÓRZ · ŁĄCZ · GRAJ","words":["TWÓRZ","ŁĄCZ","GŁOSUJ","BAW SIĘ","GRAJ"],"bank":999,"scores":[111,111],"revealed":[1,3],"crosses":[1,1]}}
    ]
  }$fixtures$,
  'Edytowalne przykładowe dane i lista kadrów galerii strony głównej'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('homepage-screenshots', 'homepage-screenshots', true, 12582912, ARRAY['image/png','image/webp','application/json']::text[])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 12582912, allowed_mime_types = ARRAY['image/png','image/webp','application/json']::text[];

DROP POLICY IF EXISTS "Public can view homepage screenshots" ON storage.objects;
CREATE POLICY "Public can view homepage screenshots" ON storage.objects
  FOR SELECT USING (bucket_id = 'homepage-screenshots');
