-- =====================================================================
-- VITAS · Pro Players Seed — Sprint A
-- ~290 jugadores élite con métricas EA FC25 normalizadas 0-99
-- Ejecutar en: https://supabase.com/dashboard/project/tloadypygzqyfefanrza/sql/new
-- =====================================================================

-- Limpiar datos previos si existen
truncate table public.pro_players restart identity cascade;

insert into public.pro_players
  (id, name, short_name, overall, potential, age, nationality, club, league, position, positions, foot, height, pace, shooting, passing, dribbling, defending, physic)
values

-- ── GOALKEEPERS ──────────────────────────────────────────────────────
('alisson_becker','Alisson Becker','Alisson',90,90,31,'Brazilian','Liverpool','Premier League','GK','{"GK"}','right',191,58,27,80,64,16,60),
('courtois_thibaut','Thibaut Courtois','Courtois',90,90,31,'Belgian','Real Madrid','La Liga','GK','{"GK"}','right',199,49,21,70,54,18,72),
('ederson_moraes','Ederson Moraes','Ederson',88,88,30,'Brazilian','Manchester City','Premier League','GK','{"GK"}','right',188,67,30,85,77,17,62),
('neuer_manuel','Manuel Neuer','Neuer',87,87,37,'German','Bayern Munich','Bundesliga','GK','{"GK"}','right',193,54,28,72,62,18,66),
('donnarumma_gianluigi','Gianluigi Donnarumma','Donnarumma',88,89,25,'Italian','Paris Saint-Germain','Ligue 1','GK','{"GK"}','right',196,55,25,72,62,15,82),
('martinez_emiliano','Emiliano Martínez','E. Martínez',87,87,31,'Argentine','Aston Villa','Premier League','GK','{"GK"}','right',195,50,25,64,62,16,78),
('oblak_jan','Jan Oblak','Oblak',88,88,31,'Slovenian','Atlético Madrid','La Liga','GK','{"GK"}','right',188,47,20,68,55,17,75),
('terstegen_marc','Marc-André ter Stegen','Ter Stegen',88,88,32,'German','Barcelona','La Liga','GK','{"GK"}','right',187,55,25,76,68,16,62),
('maignan_mike','Mike Maignan','Maignan',87,88,28,'French','AC Milan','Serie A','GK','{"GK"}','right',191,60,27,72,60,17,68),
('sommer_yann','Yann Sommer','Sommer',85,85,35,'Swiss','Inter Milan','Serie A','GK','{"GK"}','right',183,44,22,68,52,17,64),
('raya_david','David Raya','Raya',85,86,28,'Spanish','Arsenal','Premier League','GK','{"GK"}','right',183,53,24,74,60,16,66),
('kepa_arrizabalaga','Kepa Arrizabalaga','Kepa',82,83,29,'Spanish','Real Madrid','La Liga','GK','{"GK"}','right',186,50,22,68,56,17,66),

-- ── CENTER BACKS ──────────────────────────────────────────────────────
('vandijk_virgil','Virgil van Dijk','Van Dijk',90,90,32,'Dutch','Liverpool','Premier League','CB','{"CB"}','right',193,80,60,72,62,91,88),
('dias_ruben','Rúben Dias','R. Dias',88,88,26,'Portuguese','Manchester City','Premier League','CB','{"CB"}','right',187,72,42,70,56,90,82),
('rudiger_antonio','Antonio Rüdiger','Rüdiger',87,87,30,'German','Real Madrid','La Liga','CB','{"CB"}','right',190,84,50,64,57,88,87),
('bastoni_alessandro','Alessandro Bastoni','Bastoni',87,89,24,'Italian','Inter Milan','Serie A','CB','{"CB","LB"}','left',191,70,48,78,72,84,78),
('saliba_william','William Saliba','Saliba',87,92,22,'French','Arsenal','Premier League','CB','{"CB"}','right',192,82,42,74,68,87,80),
('marquinhos','Marquinhos','Marquinhos',87,87,29,'Brazilian','Paris Saint-Germain','Ligue 1','CB','{"CB","CDM"}','right',181,75,44,78,70,88,74),
('araujo_ronald','Ronald Araújo','R. Araújo',86,90,24,'Uruguayan','Barcelona','La Liga','CB','{"CB","RB"}','right',188,80,46,66,63,88,88),
('upamecano_dayot','Dayot Upamecano','Upamecano',85,87,25,'French','Bayern Munich','Bundesliga','CB','{"CB"}','right',186,85,42,68,62,86,80),
('gabriel_magalhaes','Gabriel Magalhães','Gabriel',84,87,25,'Brazilian','Arsenal','Premier League','CB','{"CB"}','left',191,72,52,62,58,86,82),
('stones_john','John Stones','Stones',85,85,29,'English','Manchester City','Premier League','CB','{"CB"}','right',188,69,46,76,68,84,72),
('devrij_stefan','Stefan de Vrij','De Vrij',84,84,32,'Dutch','Inter Milan','Serie A','CB','{"CB"}','right',189,65,47,74,68,86,75),
('cubarsi_pau','Pau Cubarsí','Cubarsí',81,92,17,'Spanish','Barcelona','La Liga','CB','{"CB"}','left',185,74,38,74,70,82,72),
('laporte_aymeric','Aymeric Laporte','Laporte',85,85,29,'Spanish','Al-Nassr','Saudi Pro League','CB','{"CB","LB"}','left',189,68,48,74,66,86,76),
('schlotterbeck_nico','Nico Schlotterbeck','Schlotterbeck',83,88,24,'German','Borussia Dortmund','Bundesliga','CB','{"CB","LB"}','left',192,74,44,72,64,84,78),
('kim_minjae','Min-jae Kim','Kim Min-jae',86,88,27,'South Korean','Bayern Munich','Bundesliga','CB','{"CB"}','right',190,80,44,64,58,88,84),
('kalulu_pierre','Pierre Kalulu','Kalulu',81,87,23,'French','Juventus','Serie A','CB','{"CB","RB"}','right',180,84,42,66,60,82,74),

-- ── FULL BACKS ────────────────────────────────────────────────────────
('alexanderarnold_trent','Trent Alexander-Arnold','Alexander-Arnold',88,89,25,'English','Real Madrid','La Liga','RB','{"RB","CM","CAM"}','right',175,82,72,91,78,68,72),
('hakimi_achraf','Achraf Hakimi','Hakimi',87,88,25,'Moroccan','Paris Saint-Germain','Ligue 1','RB','{"RB","LB","RW"}','right',181,95,68,78,80,72,77),
('hernandez_theo','Theo Hernández','T. Hernández',86,87,26,'French','AC Milan','Serie A','LB','{"LB"}','left',184,92,70,74,78,70,82),
('cancelo_joao','João Cancelo','Cancelo',86,86,29,'Portuguese','Barcelona','La Liga','RB','{"RB","LB","LW"}','right',182,80,62,85,80,75,72),
('robertson_andrew','Andrew Robertson','Robertson',85,85,29,'Scottish','Liverpool','Premier League','LB','{"LB"}','left',178,84,62,82,74,76,78),
('davies_alphonso','Alphonso Davies','Davies',85,88,23,'Canadian','Bayern Munich','Bundesliga','LB','{"LB","LW"}','left',173,96,58,76,82,72,74),
('kounde_jules','Jules Koundé','Koundé',85,87,25,'French','Barcelona','La Liga','RB','{"RB","CB"}','right',178,86,60,74,76,82,72),
('james_reece','Reece James','R. James',85,87,24,'English','Chelsea','Premier League','RB','{"RB"}','right',180,80,65,76,76,80,78),
('porro_pedro','Pedro Porro','Porro',82,85,24,'Spanish','Tottenham Hotspur','Premier League','RB','{"RB","RWB"}','right',178,84,64,76,74,74,74),
('kadioglu_ferdi','Ferdi Kadıoğlu','Kadıoğlu',83,87,24,'Dutch','Napoli','Serie A','LB','{"LB","LW"}','left',180,82,62,78,78,72,70),
('dimarco_federico','Federico Dimarco','Dimarco',83,85,26,'Italian','Inter Milan','Serie A','LB','{"LB","LW"}','left',178,76,64,80,72,76,74),
('dumfries_denzel','Denzel Dumfries','Dumfries',82,84,27,'Dutch','Inter Milan','Serie A','RB','{"RB","RWB"}','right',187,84,64,72,70,74,82),
('guerreiro_raphael','Raphaël Guerreiro','Guerreiro',82,83,30,'Portuguese','Bayern Munich','Bundesliga','LB','{"LB","CM"}','left',169,78,62,82,80,68,66),
('geertruida_lutsharel','Lutsharel Geertruida','Geertruida',79,86,23,'Dutch','RB Leipzig','Bundesliga','RB','{"RB","CB"}','right',180,80,58,70,68,78,72),
('fresneda_ivan','Iván Fresneda','Fresneda',74,86,18,'Spanish','Arsenal','Premier League','RB','{"RB"}','right',183,82,58,72,70,72,70),

-- ── DEFENSIVE MIDFIELDERS ────────────────────────────────────────────
('rodri','Rodri','Rodri',91,91,27,'Spanish','Manchester City','Premier League','CDM','{"CDM","CM"}','right',191,62,68,88,78,88,82),
('casemiro','Casemiro','Casemiro',86,86,31,'Brazilian','Manchester United','Premier League','CDM','{"CDM","CM"}','right',185,62,68,80,70,88,82),
('tchouameni_aurelien','Aurélien Tchouaméni','Tchouaméni',86,90,23,'French','Real Madrid','La Liga','CDM','{"CDM","CM"}','right',188,68,62,80,72,86,82),
('rice_declan','Declan Rice','Rice',86,88,25,'English','Arsenal','Premier League','CDM','{"CDM","CM"}','right',185,70,64,82,72,84,84),
('kimmich_joshua','Joshua Kimmich','Kimmich',89,89,28,'German','Bayern Munich','Bundesliga','CDM','{"CDM","CM","RB"}','right',177,68,70,90,78,82,76),
('zubimendi_martin','Martín Zubimendi','Zubimendi',84,88,25,'Spanish','Arsenal','Premier League','CDM','{"CDM","CM"}','right',182,66,60,84,76,85,76),
('kovacic_mateo','Mateo Kovacic','Kovacic',84,84,29,'Croatian','Manchester City','Premier League','CM','{"CM","CDM"}','right',178,72,62,84,86,72,74),
('fabinho','Fabinho','Fabinho',82,82,30,'Brazilian','Al-Ittihad','Saudi Pro League','CDM','{"CDM"}','right',188,66,58,78,70,86,82),
('brozovic_marcelo','Marcelo Brozović','Brozović',84,84,31,'Croatian','Al-Nassr','Saudi Pro League','CDM','{"CDM","CM"}','right',184,64,64,88,76,78,76),
('verratti_marco','Marco Verratti','Verratti',84,84,31,'Italian','Al-Arabi SC','QSL','CM','{"CM","CDM"}','right',165,64,62,88,88,72,66),
('barella_nicolo','Nicolò Barella','Barella',88,89,26,'Italian','Inter Milan','Serie A','CM','{"CM","CDM"}','right',172,78,72,84,82,78,84),
('dejong_frenkie','Frenkie de Jong','F. de Jong',86,87,26,'Dutch','Barcelona','La Liga','CM','{"CM","CDM"}','right',180,72,60,88,84,72,74),
('vitinha','Vitinha','Vitinha',85,88,23,'Portuguese','Paris Saint-Germain','Ligue 1','CM','{"CM","CDM"}','right',169,74,66,88,84,70,72),

-- ── CENTRAL MIDFIELDERS ──────────────────────────────────────────────
('debruyne_kevin','Kevin De Bruyne','De Bruyne',91,91,32,'Belgian','Manchester City','Premier League','CM','{"CM","CAM"}','right',181,76,82,94,88,64,78),
('pedri','Pedri','Pedri',89,93,21,'Spanish','Barcelona','La Liga','CM','{"CM","CAM"}','right',174,74,72,88,90,62,68),
('modric_luka','Luka Modrić','Modrić',87,87,38,'Croatian','Real Madrid','La Liga','CM','{"CM","CAM"}','right',172,68,74,90,88,68,66),
('brunofernandes','Bruno Fernandes','B. Fernandes',87,87,29,'Portuguese','Manchester United','Premier League','CM','{"CM","CAM"}','right',179,72,82,88,82,58,68),
('gundogan_ilkay','İlkay Gündoğan','Gündoğan',85,85,33,'German','Barcelona','La Liga','CM','{"CM","CAM"}','right',180,64,76,88,82,62,70),
('macallister_alexis','Alexis Mac Allister','Mac Allister',85,87,25,'Argentine','Liverpool','Premier League','CM','{"CM","CDM"}','right',174,70,70,84,78,72,76),
('enzofernandez','Enzo Fernández','E. Fernández',84,89,23,'Argentine','Chelsea','Premier League','CM','{"CM","CDM"}','right',178,70,72,84,78,68,72),
('kone_manu','Manu Koné','Koné',84,90,22,'French','Real Madrid','La Liga','CM','{"CM","CDM"}','right',183,76,66,82,80,74,80),
('xhaka_granit','Granit Xhaka','Xhaka',83,83,31,'Swiss','Bayer Leverkusen','Bundesliga','CM','{"CM","CDM"}','left',182,62,70,84,72,76,80),
('dieudonne_camavinga','Eduardo Camavinga','Camavinga',84,92,21,'French','Real Madrid','La Liga','CM','{"CM","CDM","LB"}','left',181,78,66,82,84,76,78),
('kroos_toni','Toni Kroos','Kroos',88,88,34,'German','Real Madrid','La Liga','CM','{"CM"}','right',183,60,78,93,80,72,68),
('gavi','Gavi','Gavi',87,92,19,'Spanish','Barcelona','La Liga','CM','{"CM","CDM"}','right',173,72,66,86,88,76,72),
('milinkovicSavic_sergej','Sergej Milinković-Savić','Milinković-Savić',85,85,28,'Serbian','Al-Hilal','Saudi Pro League','CM','{"CM","CAM"}','right',191,70,78,84,82,68,84),
('ceballos_dani','Dani Ceballos','Ceballos',80,81,27,'Spanish','Real Madrid','La Liga','CM','{"CM","CAM"}','right',179,72,66,84,84,58,68),
('mainoo_kobbie','Kobbie Mainoo','Mainoo',79,88,18,'English','Manchester United','Premier League','CM','{"CM"}','right',177,72,66,78,82,68,72),
('iniesta_andres','Andrés Iniesta','Iniesta',80,80,39,'Spanish','Vissel Kobe','J1 League','CM','{"CM","LW"}','right',171,60,66,88,88,56,60),

-- ── ATTACKING MIDFIELDERS ────────────────────────────────────────────
('bellingham_jude','Jude Bellingham','Bellingham',91,95,20,'English','Real Madrid','La Liga','CAM','{"CAM","CM"}','right',186,80,82,84,86,70,88),
('foden_phil','Phil Foden','Foden',90,93,23,'English','Manchester City','Premier League','CAM','{"CAM","LW","CM"}','left',171,82,82,86,90,52,70),
('wirtz_florian','Florian Wirtz','Wirtz',88,94,20,'German','Bayer Leverkusen','Bundesliga','CAM','{"CAM","LW","CM"}','right',176,78,78,86,90,48,70),
('odegaard_martin','Martin Ødegaard','Ødegaard',88,89,25,'Norwegian','Arsenal','Premier League','CAM','{"CAM","CM"}','right',178,74,78,90,88,54,68),
('musiala_jamal','Jamal Musiala','Musiala',88,94,20,'German','Bayern Munich','Bundesliga','CAM','{"CAM","LW","CM"}','right',179,82,78,84,90,52,72),
('bernardosilva','Bernardo Silva','B. Silva',88,88,29,'Portuguese','Manchester City','Premier League','CAM','{"CAM","CM","RW"}','right',173,78,76,88,88,62,72),
('dybala_paulo','Paulo Dybala','Dybala',85,85,30,'Argentine','AS Roma','Serie A','CAM','{"CAM","SS","RW"}','left',177,76,84,84,88,34,68),
('muller_thomas','Thomas Müller','Müller',83,83,34,'German','Bayern Munich','Bundesliga','CAM','{"CAM","ST","RW"}','right',186,72,78,84,72,60,74),
('ferreira_joao','João Félix','J. Félix',83,87,24,'Portuguese','Atlético Madrid','La Liga','CAM','{"CAM","LW","ST"}','right',181,80,80,80,86,38,68),
('mastantuono_franco','Franco Mastantuono','Mastantuono',74,91,16,'Argentine','Real Madrid','La Liga','CAM','{"CAM","CM"}','right',176,78,70,80,86,42,66),
('nwaneri_ethan','Ethan Nwaneri','Nwaneri',72,90,16,'English','Arsenal','Premier League','CAM','{"CAM","RW"}','right',183,80,68,78,84,40,66),
('doue_desire','Désiré Doué','Doué',79,90,18,'French','Paris Saint-Germain','Ligue 1','LW','{"LW","RW","CAM"}','right',181,82,72,76,86,38,68),

-- ── WINGERS ──────────────────────────────────────────────────────────
('mbappe_kylian','Kylian Mbappé','Mbappé',91,95,25,'French','Real Madrid','La Liga','LW','{"LW","ST","RW"}','right',182,97,88,82,92,38,78),
('vinicius_junior','Vinícius Júnior','Vinícius Jr.',90,93,23,'Brazilian','Real Madrid','La Liga','LW','{"LW","ST"}','right',176,95,80,78,94,32,74),
('salah_mohamed','Mohamed Salah','Salah',90,90,31,'Egyptian','Liverpool','Premier League','RW','{"RW","ST"}','left',175,90,88,80,88,44,76),
('dembele_ousmane','Ousmane Dembélé','Dembélé',86,87,26,'French','Paris Saint-Germain','Ligue 1','RW','{"RW","LW"}','right',178,92,80,80,90,38,72),
('saka_bukayo','Bukayo Saka','Saka',88,91,22,'English','Arsenal','Premier League','RW','{"RW","LW","CAM"}','left',178,84,80,82,88,58,72),
('raphinha','Raphinha','Raphinha',85,86,27,'Brazilian','Barcelona','La Liga','RW','{"RW","LW","CAM"}','left',176,88,82,80,86,46,74),
('sane_leroy','Leroy Sané','Sané',85,85,27,'German','Bayern Munich','Bundesliga','LW','{"LW","RW"}','left',183,93,80,80,88,40,74),
('rodrygo','Rodrygo','Rodrygo',84,88,23,'Brazilian','Real Madrid','La Liga','RW','{"RW","LW","ST"}','right',174,86,78,80,86,36,68),
('nicowilliams','Nico Williams','N. Williams',85,91,21,'Spanish','Athletic Bilbao','La Liga','LW','{"LW","RW"}','right',181,90,76,78,88,42,70),
('yamal_lamine','Lamine Yamal','L. Yamal',86,96,16,'Spanish','Barcelona','La Liga','RW','{"RW","LW"}','right',180,86,74,80,90,36,64),
('chiesa_federico','Federico Chiesa','Chiesa',82,85,26,'Italian','Liverpool','Premier League','LW','{"LW","RW","ST"}','right',175,88,80,72,84,50,76),
('diaz_luis','Luis Díaz','L. Díaz',84,87,27,'Colombian','Liverpool','Premier League','LW','{"LW"}','right',180,90,74,72,84,44,72),
('pulisic_christian','Christian Pulisic','Pulisic',83,85,25,'American','AC Milan','Serie A','RW','{"RW","LW","CAM"}','right',177,84,78,76,84,46,70),
('leao_rafael','Rafael Leão','Leão',85,89,24,'Portuguese','AC Milan','Serie A','LW','{"LW","ST"}','left',188,90,78,74,88,30,74),
('rashford_marcus','Marcus Rashford','Rashford',84,86,26,'English','Manchester United','Premier League','LW','{"LW","ST","RW"}','right',185,92,82,72,84,38,78),
('olise_michael','Michael Olise','Olise',83,90,22,'French','Bayern Munich','Bundesliga','RW','{"RW","CAM"}','left',178,82,78,78,86,38,66),
('adeyemi_karim','Karim Adeyemi','Adeyemi',80,87,22,'German','Borussia Dortmund','Bundesliga','LW','{"LW","ST"}','right',180,94,76,68,80,34,70),
('gnabry_serge','Serge Gnabry','Gnabry',83,84,28,'German','Bayern Munich','Bundesliga','RW','{"RW","LW","ST"}','right',175,88,80,74,84,42,72),
('coman_kingsley','Kingsley Coman','Coman',83,84,27,'French','Bayern Munich','Bundesliga','LW','{"LW","RW"}','right',180,92,74,74,84,36,70),
('mane_sadio','Sadio Mané','Mané',82,82,31,'Senegalese','Al-Nassr','Saudi Pro League','LW','{"LW","RW","ST"}','right',175,88,84,74,86,44,78),
('sterling_raheem','Raheem Sterling','Sterling',81,81,29,'English','Arsenal','Premier League','LW','{"LW","RW"}','right',170,90,80,76,84,40,68),
('diavoikovskyj','Gabriel Martinelli','Martinelli',84,88,22,'Brazilian','Arsenal','Premier League','LW','{"LW","ST"}','right',178,86,78,72,82,42,76),
('antony','Antony','Antony',80,83,24,'Brazilian','Manchester United','Premier League','RW','{"RW","LW"}','left',172,84,74,70,84,34,66),
('veron_santiago','Alejandro Garnacho','Garnacho',82,89,19,'Argentine','Manchester United','Premier League','LW','{"LW","RW"}','right',180,88,76,74,84,36,70),
('baena_alex','Alex Baena','A. Baena',81,87,22,'Spanish','Villarreal','La Liga','LW','{"LW","CAM"}','right',171,82,72,80,86,38,66),
('diallo_amad','Amad Diallo','A. Diallo',77,86,21,'Ivorian','Manchester United','Premier League','RW','{"RW"}','right',172,82,70,72,82,32,62),
('gnonto_wilfried','Wilfried Gnonto','Gnonto',76,87,20,'Italian','Leeds United','Championship','LW','{"LW","RW","ST"}','right',170,88,68,70,82,36,68),

-- ── STRIKERS ────────────────────────────────────────────────────────
('haaland_erling','Erling Haaland','Haaland',94,96,23,'Norwegian','Manchester City','Premier League','ST','{"ST"}','left',194,89,94,68,78,44,88),
('kane_harry','Harry Kane','Kane',90,90,30,'English','Bayern Munich','Bundesliga','ST','{"ST"}','right',188,70,92,80,78,44,82),
('benzema_karim','Karim Benzema','Benzema',88,88,36,'French','Al-Ittihad','Saudi Pro League','ST','{"ST","CAM"}','right',185,74,86,82,84,38,76),
('lewandowski_robert','Robert Lewandowski','Lewandowski',88,88,35,'Polish','Barcelona','La Liga','ST','{"ST"}','right',185,77,92,78,80,42,82),
('osimhen_victor','Victor Osimhen','Osimhen',87,89,25,'Nigerian','Galatasaray','Süper Lig','ST','{"ST"}','right',185,91,86,68,78,36,86),
('martinez_lautaro','Lautaro Martínez','L. Martínez',88,90,26,'Argentine','Inter Milan','Serie A','ST','{"ST"}','right',174,80,88,72,82,42,80),
('isak_alexander','Alexander Isak','Isak',85,90,24,'Swedish','Newcastle United','Premier League','ST','{"ST"}','right',192,84,84,74,82,40,78),
('vlahovic_dusan','Dušan Vlahović','Vlahović',85,88,24,'Serbian','Juventus','Serie A','ST','{"ST"}','left',190,76,88,66,72,36,84),
('nunez_darwin','Darwin Núñez','D. Núñez',84,89,24,'Uruguayan','Liverpool','Premier League','ST','{"ST","LW"}','left',187,90,82,68,74,38,84),
('richarlison','Richarlison','Richarlison',83,84,26,'Brazilian','Tottenham Hotspur','Premier League','ST','{"ST","LW"}','right',184,84,82,68,76,46,82),
('griezmann_antoine','Antoine Griezmann','Griezmann',85,85,32,'French','Atlético Madrid','La Liga','SS','{"SS","ST","LW"}','left',176,78,86,80,84,48,72),
('lukaku_romelu','Romelu Lukaku','Lukaku',84,84,30,'Belgian','Napoli','Serie A','ST','{"ST"}','right',190,76,86,64,70,42,90),
('immobile_ciro','Ciro Immobile','Immobile',82,82,33,'Italian','Besiktas','Süper Lig','ST','{"ST"}','right',185,76,88,68,74,36,72),
('morata_alvaro','Álvaro Morata','Morata',82,82,31,'Spanish','AC Milan','Serie A','ST','{"ST"}','right',189,80,84,72,72,42,72),
('gabriel_jesus','Gabriel Jesus','G. Jesus',82,83,26,'Brazilian','Arsenal','Premier League','ST','{"ST","LW","RW"}','right',175,84,78,74,80,50,68),
('depay_memphis','Memphis Depay','Memphis',82,82,29,'Dutch','Atlético Madrid','La Liga','ST','{"ST","LW"}','left',176,88,82,78,88,36,72),
('aubameyang_pierre','Pierre-Emerick Aubameyang','Aubameyang',80,80,34,'Gabonese','Marseille','Ligue 1','ST','{"ST"}','right',187,88,84,62,74,32,74),
('correa_joaquin','Joaquín Correa','Correa',79,80,29,'Argentine','Marseille','Ligue 1','ST','{"ST","LW"}','right',187,86,74,68,78,32,72),
('joselu','Joselu','Joselu',78,78,33,'Spanish','Real Madrid','La Liga','ST','{"ST"}','right',191,66,80,62,62,38,82),
('suarez_luis','Luis Suárez','Suárez',80,80,37,'Uruguayan','Inter Miami','MLS','ST','{"ST"}','right',182,68,88,74,82,38,68),

-- ── LEYENDAS / ESPECIALES ────────────────────────────────────────────
('messi_lionel','Lionel Messi','Messi',90,90,36,'Argentine','Inter Miami','MLS','RW','{"RW","CAM","SS"}','left',170,78,88,90,94,38,60),
('ronaldo_cristiano','Cristiano Ronaldo','Ronaldo',88,88,39,'Portuguese','Al-Nassr','Saudi Pro League','ST','{"ST","LW"}','right',187,82,92,72,82,28,76),
('neymar_jr','Neymar Jr.','Neymar Jr.',86,86,32,'Brazilian','Al-Hilal','Saudi Pro League','LW','{"LW","RW","CAM"}','right',175,86,82,84,94,34,66),

-- ── JÓVENES TALENTOS ─────────────────────────────────────────────────
('endrick','Endrick','Endrick',77,92,17,'Brazilian','Real Madrid','La Liga','ST','{"ST","LW"}','right',173,84,80,64,82,28,74),
('guiu_marc','Marc Guiu','M. Guiu',74,88,18,'Spanish','Chelsea','Premier League','ST','{"ST"}','right',181,78,76,62,74,30,72),
('camarda_francesco','Francesco Camarda','Camarda',68,88,16,'Italian','AC Milan','Serie A','ST','{"ST"}','right',181,76,72,58,70,28,68),
('ansu_fati','Ansu Fati','A. Fati',79,86,21,'Spanish','Barcelona','La Liga','LW','{"LW","ST"}','right',178,86,76,72,84,36,68),
('torres_ferran','Ferran Torres','F. Torres',81,83,23,'Spanish','Barcelona','La Liga','LW','{"LW","RW","ST"}','right',184,84,78,74,78,42,70);

-- Verificación
select count(*) as total_players, position, count(*) as per_position
from public.pro_players
group by position
order by count(*) desc;
