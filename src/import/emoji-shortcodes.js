// GitHub-style emoji shortcodes (":smile:") -> Unicode, for MkDocs Material's pymdownx.emoji.
// Generated from gemoji 8.1.0 (MIT, https://github.com/wooorm/gemoji) plus the github, cldr and iamcal
// shortcode sets of emojibase-data 18.0.0 (MIT, https://github.com/milesj/emojibase); see NOTICES.
// One row per emoji: the character, then every alias. Parsed once at load.
const TABLE = `
😀 grinning grinning_face
😃 smiley grinning_face_with_big_eyes
😄 smile grinning_face_with_smiling_eyes
😁 grin beaming_face_with_smiling_eyes
😆 laughing satisfied grinning_squinting_face
😅 sweat_smile grinning_face_with_sweat
🤣 rofl rolling_on_the_floor_laughing
😂 joy face_with_tears_of_joy
🙂 slightly_smiling_face
🙃 upside_down_face
🫠 melting_face
😉 wink winking_face
😊 blush smiling_face_with_smiling_eyes
😇 innocent smiling_face_with_halo
🥰 smiling_face_with_three_hearts smiling_face_with_hearts smiling_face_with_3_hearts
😍 heart_eyes smiling_face_with_heart_eyes
🤩 star_struck star-struck grinning_face_with_star_eyes
😘 kissing_heart face_blowing_a_kiss
😗 kissing kissing_face
☺️ relaxed smiling_face
😚 kissing_closed_eyes kissing_face_with_closed_eyes
😙 kissing_smiling_eyes kissing_face_with_smiling_eyes
🥲 smiling_face_with_tear
😋 yum face_savoring_food
😛 stuck_out_tongue face_with_tongue
😜 stuck_out_tongue_winking_eye winking_face_with_tongue
🤪 zany_face grinning_face_with_one_large_and_one_small_eye
😝 stuck_out_tongue_closed_eyes squinting_face_with_tongue
🤑 money_mouth_face
🤗 hugs smiling_face_with_open_hands hugging_face
🤭 hand_over_mouth face_with_hand_over_mouth smiling_face_with_smiling_eyes_and_hand_covering_mouth
🫢 face_with_open_eyes_and_hand_over_mouth
🫣 face_with_peeking_eye
🤫 shushing_face face_with_finger_covering_closed_lips
🤔 thinking thinking_face
🫡 saluting_face
🤐 zipper_mouth_face
🤨 raised_eyebrow face_with_raised_eyebrow face_with_one_eyebrow_raised
😐 neutral_face
😑 expressionless expressionless_face
😶 no_mouth face_without_mouth
🫥 dotted_line_face
😶‍🌫️ face_in_clouds
😏 smirk smirking_face
😒 unamused unamused_face
🙄 roll_eyes face_with_rolling_eyes
😬 grimacing grimacing_face
😮‍💨 face_exhaling
🤥 lying_face
🫨 shaking_face
😌 relieved relieved_face
😔 pensive pensive_face
😪 sleepy sleepy_face
🤤 drooling_face
😴 sleeping sleeping_face
😷 mask face_with_medical_mask
🤒 face_with_thermometer
🤕 face_with_head_bandage
🤢 nauseated_face
🤮 vomiting_face face_vomiting face_with_open_mouth_vomiting
🤧 sneezing_face
🥵 hot_face
🥶 cold_face
🥴 woozy_face
😵 dizzy_face face_with_crossed_out_eyes
😵‍💫 face_with_spiral_eyes
🤯 exploding_head shocked_face_with_exploding_head
🤠 cowboy_hat_face face_with_cowboy_hat
🥳 partying_face
🥸 disguised_face
😎 sunglasses smiling_face_with_sunglasses
🤓 nerd_face
🧐 monocle_face face_with_monocle
😕 confused confused_face
🫤 face_with_diagonal_mouth
😟 worried worried_face
🙁 slightly_frowning_face
☹️ frowning_face white_frowning_face
😮 open_mouth face_with_open_mouth
😯 hushed hushed_face
😲 astonished astonished_face
😳 flushed flushed_face
🥺 pleading_face
🥹 face_holding_back_tears
😦 frowning frowning_face_with_open_mouth
😧 anguished anguished_face
😨 fearful fearful_face
😰 cold_sweat anxious_face_with_sweat
😥 disappointed_relieved sad_but_relieved_face
😢 cry crying_face
😭 sob loudly_crying_face
😱 scream face_screaming_in_fear
😖 confounded confounded_face
😣 persevere persevering_face
😞 disappointed disappointed_face
😓 sweat downcast_face_with_sweat
😩 weary weary_face
😫 tired_face
🥱 yawning_face
😤 triumph face_with_steam_from_nose
😡 rage pout enraged_face
😠 angry angry_face
🤬 cursing_face face_with_symbols_on_mouth serious_face_with_symbols_covering_mouth
😈 smiling_imp smiling_face_with_horns
👿 imp angry_face_with_horns
💀 skull
☠️ skull_and_crossbones
💩 hankey poop shit pile_of_poo
🤡 clown_face
👹 japanese_ogre ogre
👺 japanese_goblin goblin
👻 ghost
👽 alien
👾 space_invader alien_monster
🤖 robot robot_face
😺 smiley_cat grinning_cat
😸 smile_cat grinning_cat_with_smiling_eyes
😹 joy_cat cat_with_tears_of_joy
😻 heart_eyes_cat smiling_cat_with_heart_eyes
😼 smirk_cat cat_with_wry_smile
😽 kissing_cat
🙀 scream_cat weary_cat
😿 crying_cat_face crying_cat
😾 pouting_cat
🙈 see_no_evil see_no_evil_monkey
🙉 hear_no_evil hear_no_evil_monkey
🙊 speak_no_evil speak_no_evil_monkey
💌 love_letter
💘 cupid heart_with_arrow
💝 gift_heart heart_with_ribbon
💖 sparkling_heart
💗 heartpulse growing_heart
💓 heartbeat beating_heart
💞 revolving_hearts
💕 two_hearts
💟 heart_decoration
❣️ heavy_heart_exclamation heart_exclamation heavy_heart_exclamation_mark_ornament
💔 broken_heart
❤️‍🔥 heart_on_fire
❤️‍🩹 mending_heart
❤️ heart red_heart
🩷 pink_heart
🧡 orange_heart
💛 yellow_heart
💚 green_heart
💙 blue_heart
🩵 light_blue_heart
💜 purple_heart
🤎 brown_heart
🖤 black_heart
🩶 grey_heart
🤍 white_heart
💋 kiss kiss_mark
💯 100 hundred_points
💢 anger anger_symbol
💥 boom collision
💫 dizzy
💦 sweat_drops sweat_droplets
💨 dash dashing_away
🕳️ hole
💬 speech_balloon
👁️‍🗨️ eye_speech_bubble eye_in_speech_bubble eye-in-speech-bubble
🗨️ left_speech_bubble
🗯️ right_anger_bubble
💭 thought_balloon
💤 zzz
👋 wave waving_hand
🤚 raised_back_of_hand
🖐️ raised_hand_with_fingers_splayed hand_with_fingers_splayed
✋ hand raised_hand
🖖 vulcan_salute spock-hand
🫱 rightwards_hand
🫲 leftwards_hand
🫳 palm_down_hand
🫴 palm_up_hand
🫷 leftwards_pushing_hand
🫸 rightwards_pushing_hand
👌 ok_hand
🤌 pinched_fingers
🤏 pinching_hand
✌️ v victory_hand
🤞 crossed_fingers hand_with_index_and_middle_fingers_crossed
🫰 hand_with_index_finger_and_thumb_crossed
🤟 love_you_gesture i_love_you_hand_sign
🤘 metal sign_of_the_horns the_horns
🤙 call_me_hand
👈 point_left backhand_index_pointing_left
👉 point_right backhand_index_pointing_right
👆 point_up_2 backhand_index_pointing_up
🖕 middle_finger fu reversed_hand_with_middle_finger_extended
👇 point_down backhand_index_pointing_down
☝️ point_up index_pointing_up
🫵 index_pointing_at_the_viewer
👍 +1 thumbsup thumbs_up
👎 -1 thumbsdown thumbs_down
✊ fist_raised fist raised_fist
👊 fist_oncoming facepunch punch oncoming_fist
🤛 fist_left left_facing_fist left-facing_fist
🤜 fist_right right_facing_fist right-facing_fist
👏 clap clapping_hands
🙌 raised_hands raising_hands
🫶 heart_hands
👐 open_hands
🤲 palms_up_together
🤝 handshake
🙏 pray folded_hands
✍️ writing_hand
💅 nail_care nail_polish
🤳 selfie
💪 muscle flexed_biceps
🦾 mechanical_arm
🦿 mechanical_leg
🦵 leg
🦶 foot
👂 ear
🦻 ear_with_hearing_aid
👃 nose
🧠 brain
🫀 anatomical_heart
🫁 lungs
🦷 tooth
🦴 bone
👀 eyes
👁️ eye
👅 tongue
👄 lips mouth
🫦 biting_lip
👶 baby
🧒 child
👦 boy
👧 girl
🧑 adult person
👱 blond_haired_person person_blond_hair person_with_blond_hair
👨 man
🧔 bearded_person person_beard
🧔‍♂️ man_beard man_with_beard
🧔‍♀️ woman_beard woman_with_beard
👨‍🦰 red_haired_man man_red_hair
👨‍🦱 curly_haired_man man_curly_hair
👨‍🦳 white_haired_man man_white_hair
👨‍🦲 bald_man man_bald
👩 woman
👩‍🦰 red_haired_woman woman_red_hair
🧑‍🦰 person_red_hair red_haired_person
👩‍🦱 curly_haired_woman woman_curly_hair
🧑‍🦱 person_curly_hair curly_haired_person
👩‍🦳 white_haired_woman woman_white_hair
🧑‍🦳 person_white_hair white_haired_person
👩‍🦲 bald_woman woman_bald
🧑‍🦲 person_bald bald_person
👱‍♀️ blond_haired_woman blonde_woman woman_blond_hair blond-haired-woman
👱‍♂️ blond_haired_man man_blond_hair blond-haired-man
🧓 older_adult older_person
👴 older_man old_man
👵 older_woman old_woman
🙍 frowning_person person_frowning
🙍‍♂️ frowning_man man_frowning man-frowning
🙍‍♀️ frowning_woman woman_frowning woman-frowning
🙎 pouting_face person_pouting person_with_pouting_face
🙎‍♂️ pouting_man man_pouting man-pouting
🙎‍♀️ pouting_woman woman_pouting woman-pouting
🙅 no_good person_gesturing_no
🙅‍♂️ no_good_man ng_man man_gesturing_no man-gesturing-no
🙅‍♀️ no_good_woman ng_woman woman_gesturing_no woman-gesturing-no
🙆 ok_person person_gesturing_ok
🙆‍♂️ ok_man man_gesturing_ok man-gesturing-ok
🙆‍♀️ ok_woman woman_gesturing_ok woman-gesturing-ok
💁 tipping_hand_person information_desk_person person_tipping_hand
💁‍♂️ tipping_hand_man sassy_man man_tipping_hand man-tipping-hand
💁‍♀️ tipping_hand_woman sassy_woman woman_tipping_hand woman-tipping-hand
🙋 raising_hand person_raising_hand
🙋‍♂️ raising_hand_man man_raising_hand man-raising-hand
🙋‍♀️ raising_hand_woman woman_raising_hand woman-raising-hand
🧏 deaf_person
🧏‍♂️ deaf_man
🧏‍♀️ deaf_woman
🙇 bow person_bowing
🙇‍♂️ bowing_man man_bowing man-bowing
🙇‍♀️ bowing_woman woman_bowing woman-bowing
🤦 facepalm person_facepalming face_palm
🤦‍♂️ man_facepalming man-facepalming
🤦‍♀️ woman_facepalming woman-facepalming
🤷 shrug person_shrugging
🤷‍♂️ man_shrugging man-shrugging
🤷‍♀️ woman_shrugging woman-shrugging
🧑‍⚕️ health_worker
👨‍⚕️ man_health_worker male-doctor
👩‍⚕️ woman_health_worker female-doctor
🧑‍🎓 student
👨‍🎓 man_student male-student
👩‍🎓 woman_student female-student
🧑‍🏫 teacher
👨‍🏫 man_teacher male-teacher
👩‍🏫 woman_teacher female-teacher
🧑‍⚖️ judge
👨‍⚖️ man_judge male-judge
👩‍⚖️ woman_judge female-judge
🧑‍🌾 farmer
👨‍🌾 man_farmer male-farmer
👩‍🌾 woman_farmer female-farmer
🧑‍🍳 cook
👨‍🍳 man_cook male-cook
👩‍🍳 woman_cook female-cook
🧑‍🔧 mechanic
👨‍🔧 man_mechanic male-mechanic
👩‍🔧 woman_mechanic female-mechanic
🧑‍🏭 factory_worker
👨‍🏭 man_factory_worker male-factory-worker
👩‍🏭 woman_factory_worker female-factory-worker
🧑‍💼 office_worker
👨‍💼 man_office_worker male-office-worker
👩‍💼 woman_office_worker female-office-worker
🧑‍🔬 scientist
👨‍🔬 man_scientist male-scientist
👩‍🔬 woman_scientist female-scientist
🧑‍💻 technologist
👨‍💻 man_technologist male-technologist
👩‍💻 woman_technologist female-technologist
🧑‍🎤 singer
👨‍🎤 man_singer male-singer
👩‍🎤 woman_singer female-singer
🧑‍🎨 artist
👨‍🎨 man_artist male-artist
👩‍🎨 woman_artist female-artist
🧑‍✈️ pilot
👨‍✈️ man_pilot male-pilot
👩‍✈️ woman_pilot female-pilot
🧑‍🚀 astronaut
👨‍🚀 man_astronaut male-astronaut
👩‍🚀 woman_astronaut female-astronaut
🧑‍🚒 firefighter
👨‍🚒 man_firefighter male-firefighter
👩‍🚒 woman_firefighter female-firefighter
👮 police_officer cop
👮‍♂️ policeman man_police_officer male-police-officer
👮‍♀️ policewoman woman_police_officer female-police-officer
🕵️ detective sleuth_or_spy
🕵️‍♂️ male_detective man_detective male-detective
🕵️‍♀️ female_detective woman_detective female-detective
💂 guard
💂‍♂️ guardsman man_guard male-guard
💂‍♀️ guardswoman woman_guard female-guard
🥷 ninja
👷 construction_worker
👷‍♂️ construction_worker_man man_construction_worker male-construction-worker
👷‍♀️ construction_worker_woman woman_construction_worker female-construction-worker
🫅 person_with_crown
🤴 prince
👸 princess
👳 person_with_turban person_wearing_turban
👳‍♂️ man_with_turban man_wearing_turban man-wearing-turban
👳‍♀️ woman_with_turban woman_wearing_turban woman-wearing-turban
👲 man_with_gua_pi_mao person_with_skullcap
🧕 woman_with_headscarf person_with_headscarf
🤵 person_in_tuxedo
🤵‍♂️ man_in_tuxedo
🤵‍♀️ woman_in_tuxedo
👰 person_with_veil
👰‍♂️ man_with_veil
👰‍♀️ woman_with_veil bride_with_veil
🤰 pregnant_woman
🫃 pregnant_man
🫄 pregnant_person
🤱 breast_feeding breast-feeding
👩‍🍼 woman_feeding_baby
👨‍🍼 man_feeding_baby
🧑‍🍼 person_feeding_baby
👼 angel baby_angel
🎅 santa santa_claus
🤶 mrs_claus mother_christmas
🧑‍🎄 mx_claus
🦸 superhero
🦸‍♂️ superhero_man man_superhero male_superhero
🦸‍♀️ superhero_woman woman_superhero female_superhero
🦹 supervillain
🦹‍♂️ supervillain_man man_supervillain male_supervillain
🦹‍♀️ supervillain_woman woman_supervillain female_supervillain
🧙 mage
🧙‍♂️ mage_man man_mage male_mage
🧙‍♀️ mage_woman woman_mage female_mage
🧚 fairy
🧚‍♂️ fairy_man man_fairy male_fairy
🧚‍♀️ fairy_woman woman_fairy female_fairy
🧛 vampire
🧛‍♂️ vampire_man man_vampire male_vampire
🧛‍♀️ vampire_woman woman_vampire female_vampire
🧜 merperson
🧜‍♂️ merman
🧜‍♀️ mermaid
🧝 elf
🧝‍♂️ elf_man man_elf male_elf
🧝‍♀️ elf_woman woman_elf female_elf
🧞 genie
🧞‍♂️ genie_man man_genie male_genie
🧞‍♀️ genie_woman woman_genie female_genie
🧟 zombie
🧟‍♂️ zombie_man man_zombie male_zombie
🧟‍♀️ zombie_woman woman_zombie female_zombie
🧌 troll
💆 massage person_getting_massage
💆‍♂️ massage_man man_getting_massage man-getting-massage
💆‍♀️ massage_woman woman_getting_massage woman-getting-massage
💇 haircut person_getting_haircut
💇‍♂️ haircut_man man_getting_haircut man-getting-haircut
💇‍♀️ haircut_woman woman_getting_haircut woman-getting-haircut
🚶 walking person_walking
🚶‍♂️ walking_man man_walking man-walking
🚶‍♀️ walking_woman woman_walking woman-walking
🧍 standing_person person_standing
🧍‍♂️ standing_man man_standing
🧍‍♀️ standing_woman woman_standing
🧎 kneeling_person person_kneeling
🧎‍♂️ kneeling_man man_kneeling
🧎‍♀️ kneeling_woman woman_kneeling
🧑‍🦯 person_with_probing_cane person_with_white_cane
👨‍🦯 man_with_probing_cane man_with_white_cane
👩‍🦯 woman_with_probing_cane woman_with_white_cane
🧑‍🦼 person_in_motorized_wheelchair
👨‍🦼 man_in_motorized_wheelchair
👩‍🦼 woman_in_motorized_wheelchair
🧑‍🦽 person_in_manual_wheelchair
👨‍🦽 man_in_manual_wheelchair
👩‍🦽 woman_in_manual_wheelchair
🏃 runner running person_running
🏃‍♂️ running_man man_running man-running
🏃‍♀️ running_woman woman_running woman-running
💃 woman_dancing dancer
🕺 man_dancing
🕴️ business_suit_levitating person_in_suit_levitating man_in_business_suit_levitating
👯 dancers people_with_bunny_ears
👯‍♂️ dancing_men men_with_bunny_ears men-with-bunny-ears-partying man-with-bunny-ears-partying
👯‍♀️ dancing_women women_with_bunny_ears women-with-bunny-ears-partying woman-with-bunny-ears-partying
🧖 sauna_person person_in_steamy_room
🧖‍♂️ sauna_man man_in_steamy_room
🧖‍♀️ sauna_woman woman_in_steamy_room
🧗 climbing person_climbing
🧗‍♂️ climbing_man man_climbing
🧗‍♀️ climbing_woman woman_climbing
🤺 person_fencing fencer
🏇 horse_racing
⛷️ skier
🏂 snowboarder
🏌️ golfing person_golfing golfer
🏌️‍♂️ golfing_man man_golfing man-golfing
🏌️‍♀️ golfing_woman woman_golfing woman-golfing
🏄 surfer person_surfing
🏄‍♂️ surfing_man man_surfing man-surfing
🏄‍♀️ surfing_woman woman_surfing woman-surfing
🚣 rowboat person_rowing_boat
🚣‍♂️ rowing_man man_rowing_boat man-rowing-boat
🚣‍♀️ rowing_woman woman_rowing_boat woman-rowing-boat
🏊 swimmer person_swimming
🏊‍♂️ swimming_man man_swimming man-swimming
🏊‍♀️ swimming_woman woman_swimming woman-swimming
⛹️ bouncing_ball_person person_bouncing_ball person_with_ball
⛹️‍♂️ bouncing_ball_man basketball_man man_bouncing_ball man-bouncing-ball
⛹️‍♀️ bouncing_ball_woman basketball_woman woman_bouncing_ball woman-bouncing-ball
🏋️ weight_lifting person_lifting_weights weight_lifter
🏋️‍♂️ weight_lifting_man man_lifting_weights man-lifting-weights
🏋️‍♀️ weight_lifting_woman woman_lifting_weights woman-lifting-weights
🚴 bicyclist person_biking
🚴‍♂️ biking_man man_biking man-biking
🚴‍♀️ biking_woman woman_biking woman-biking
🚵 mountain_bicyclist person_mountain_biking
🚵‍♂️ mountain_biking_man man_mountain_biking man-mountain-biking
🚵‍♀️ mountain_biking_woman woman_mountain_biking woman-mountain-biking
🤸 cartwheeling person_cartwheeling person_doing_cartwheel
🤸‍♂️ man_cartwheeling man-cartwheeling
🤸‍♀️ woman_cartwheeling woman-cartwheeling
🤼 wrestling people_wrestling wrestlers
🤼‍♂️ men_wrestling man-wrestling
🤼‍♀️ women_wrestling woman-wrestling
🤽 water_polo person_playing_water_polo
🤽‍♂️ man_playing_water_polo man-playing-water-polo
🤽‍♀️ woman_playing_water_polo woman-playing-water-polo
🤾 handball_person person_playing_handball handball
🤾‍♂️ man_playing_handball man-playing-handball
🤾‍♀️ woman_playing_handball woman-playing-handball
🤹 juggling_person person_juggling juggling
🤹‍♂️ man_juggling man-juggling
🤹‍♀️ woman_juggling woman-juggling
🧘 lotus_position person_in_lotus_position
🧘‍♂️ lotus_position_man man_in_lotus_position
🧘‍♀️ lotus_position_woman woman_in_lotus_position
🛀 bath person_taking_bath
🛌 sleeping_bed person_in_bed sleeping_accommodation
🧑‍🤝‍🧑 people_holding_hands
👭 two_women_holding_hands women_holding_hands
👫 couple woman_and_man_holding_hands man_and_woman_holding_hands
👬 two_men_holding_hands men_holding_hands
💏 couplekiss
👩‍❤️‍💋‍👨 couplekiss_man_woman kiss_woman_man woman-kiss-man
👨‍❤️‍💋‍👨 couplekiss_man_man kiss_man_man man-kiss-man
👩‍❤️‍💋‍👩 couplekiss_woman_woman kiss_woman_woman woman-kiss-woman
💑 couple_with_heart
👩‍❤️‍👨 couple_with_heart_woman_man woman-heart-man
👨‍❤️‍👨 couple_with_heart_man_man man-heart-man
👩‍❤️‍👩 couple_with_heart_woman_woman woman-heart-woman
👪 family
👨‍👩‍👦 family_man_woman_boy man-woman-boy
👨‍👩‍👧 family_man_woman_girl man-woman-girl
👨‍👩‍👧‍👦 family_man_woman_girl_boy man-woman-girl-boy
👨‍👩‍👦‍👦 family_man_woman_boy_boy man-woman-boy-boy
👨‍👩‍👧‍👧 family_man_woman_girl_girl man-woman-girl-girl
👨‍👨‍👦 family_man_man_boy man-man-boy
👨‍👨‍👧 family_man_man_girl man-man-girl
👨‍👨‍👧‍👦 family_man_man_girl_boy man-man-girl-boy
👨‍👨‍👦‍👦 family_man_man_boy_boy man-man-boy-boy
👨‍👨‍👧‍👧 family_man_man_girl_girl man-man-girl-girl
👩‍👩‍👦 family_woman_woman_boy woman-woman-boy
👩‍👩‍👧 family_woman_woman_girl woman-woman-girl
👩‍👩‍👧‍👦 family_woman_woman_girl_boy woman-woman-girl-boy
👩‍👩‍👦‍👦 family_woman_woman_boy_boy woman-woman-boy-boy
👩‍👩‍👧‍👧 family_woman_woman_girl_girl woman-woman-girl-girl
👨‍👦 family_man_boy man-boy
👨‍👦‍👦 family_man_boy_boy man-boy-boy
👨‍👧 family_man_girl man-girl
👨‍👧‍👦 family_man_girl_boy man-girl-boy
👨‍👧‍👧 family_man_girl_girl man-girl-girl
👩‍👦 family_woman_boy woman-boy
👩‍👦‍👦 family_woman_boy_boy woman-boy-boy
👩‍👧 family_woman_girl woman-girl
👩‍👧‍👦 family_woman_girl_boy woman-girl-boy
👩‍👧‍👧 family_woman_girl_girl woman-girl-girl
🗣️ speaking_head speaking_head_in_silhouette
👤 bust_in_silhouette
👥 busts_in_silhouette
🫂 people_hugging
👣 footprints
🐵 monkey_face
🐒 monkey
🦍 gorilla
🦧 orangutan
🐶 dog dog_face
🐕 dog2
🦮 guide_dog
🐕‍🦺 service_dog
🐩 poodle
🐺 wolf
🦊 fox_face fox
🦝 raccoon
🐱 cat cat_face
🐈 cat2
🐈‍⬛ black_cat
🦁 lion lion_face
🐯 tiger tiger_face
🐅 tiger2
🐆 leopard
🐴 horse horse_face
🫎 moose
🫏 donkey
🐎 racehorse
🦄 unicorn unicorn_face
🦓 zebra zebra_face
🦌 deer
🦬 bison
🐮 cow cow_face
🐂 ox
🐃 water_buffalo
🐄 cow2
🐷 pig pig_face
🐖 pig2
🐗 boar
🐽 pig_nose
🐏 ram
🐑 sheep ewe
🐐 goat
🐪 dromedary_camel
🐫 camel two_hump_camel
🦙 llama
🦒 giraffe giraffe_face
🐘 elephant
🦣 mammoth
🦏 rhinoceros
🦛 hippopotamus
🐭 mouse mouse_face
🐁 mouse2
🐀 rat
🐹 hamster
🐰 rabbit rabbit_face
🐇 rabbit2
🐿️ chipmunk
🦫 beaver
🦔 hedgehog
🦇 bat
🐻 bear
🐻‍❄️ polar_bear
🐨 koala
🐼 panda_face panda
🦥 sloth
🦦 otter
🦨 skunk
🦘 kangaroo
🦡 badger
🐾 feet paw_prints
🦃 turkey
🐔 chicken
🐓 rooster
🐣 hatching_chick
🐤 baby_chick
🐥 hatched_chick front_facing_baby_chick
🐦 bird
🐧 penguin
🕊️ dove dove_of_peace
🦅 eagle
🦆 duck
🦢 swan
🦉 owl
🦤 dodo
🪶 feather
🦩 flamingo
🦚 peacock
🦜 parrot
🪽 wing
🐦‍⬛ black_bird
🪿 goose
🐸 frog
🐊 crocodile
🐢 turtle
🦎 lizard
🐍 snake
🐲 dragon_face
🐉 dragon
🦕 sauropod
🦖 t-rex trex
🐳 whale spouting_whale
🐋 whale2
🐬 dolphin flipper
🦭 seal
🐟 fish
🐠 tropical_fish
🐡 blowfish
🦈 shark
🐙 octopus
🐚 shell spiral_shell
🪸 coral
🪼 jellyfish
🐌 snail
🦋 butterfly
🐛 bug
🐜 ant
🐝 bee honeybee
🪲 beetle
🐞 lady_beetle ladybug
🦗 cricket
🪳 cockroach
🕷️ spider
🕸️ spider_web
🦂 scorpion
🦟 mosquito
🪰 fly
🪱 worm
🦠 microbe
💐 bouquet
🌸 cherry_blossom
💮 white_flower
🪷 lotus
🏵️ rosette
🌹 rose
🥀 wilted_flower
🌺 hibiscus
🌻 sunflower
🌼 blossom
🌷 tulip
🪻 hyacinth
🌱 seedling
🪴 potted_plant
🌲 evergreen_tree
🌳 deciduous_tree
🌴 palm_tree
🌵 cactus
🌾 ear_of_rice sheaf_of_rice
🌿 herb
☘️ shamrock
🍀 four_leaf_clover
🍁 maple_leaf
🍂 fallen_leaf
🍃 leaves leaf_fluttering_in_wind
🪹 empty_nest
🪺 nest_with_eggs
🍄 mushroom
🍇 grapes
🍈 melon
🍉 watermelon
🍊 tangerine orange mandarin
🍋 lemon
🍌 banana
🍍 pineapple
🥭 mango
🍎 apple red_apple
🍏 green_apple
🍐 pear
🍑 peach
🍒 cherries
🍓 strawberry
🫐 blueberries
🥝 kiwi_fruit kiwifruit
🍅 tomato
🫒 olive
🥥 coconut
🥑 avocado
🍆 eggplant
🥔 potato
🥕 carrot
🌽 corn ear_of_corn
🌶️ hot_pepper
🫑 bell_pepper
🥒 cucumber
🥬 leafy_green
🥦 broccoli
🧄 garlic
🧅 onion
🥜 peanuts
🫘 beans
🌰 chestnut
🫚 ginger_root
🫛 pea_pod
🍞 bread
🥐 croissant
🥖 baguette_bread
🫓 flatbread
🥨 pretzel
🥯 bagel
🥞 pancakes
🧇 waffle
🧀 cheese cheese_wedge
🍖 meat_on_bone
🍗 poultry_leg
🥩 cut_of_meat
🥓 bacon
🍔 hamburger
🍟 fries french_fries
🍕 pizza
🌭 hotdog hot_dog
🥪 sandwich
🌮 taco
🌯 burrito
🫔 tamale
🥙 stuffed_flatbread
🧆 falafel
🥚 egg
🍳 fried_egg cooking
🥘 shallow_pan_of_food
🍲 stew pot_of_food
🫕 fondue
🥣 bowl_with_spoon
🥗 green_salad
🍿 popcorn
🧈 butter
🧂 salt
🥫 canned_food
🍱 bento bento_box
🍘 rice_cracker
🍙 rice_ball
🍚 rice cooked_rice
🍛 curry curry_rice
🍜 ramen steaming_bowl
🍝 spaghetti
🍠 sweet_potato roasted_sweet_potato
🍢 oden
🍣 sushi
🍤 fried_shrimp
🍥 fish_cake fish_cake_with_swirl
🥮 moon_cake
🍡 dango
🥟 dumpling
🥠 fortune_cookie
🥡 takeout_box
🦀 crab
🦞 lobster
🦐 shrimp
🦑 squid
🦪 oyster
🍦 icecream soft_ice_cream
🍧 shaved_ice
🍨 ice_cream
🍩 doughnut
🍪 cookie
🎂 birthday birthday_cake
🍰 cake shortcake
🧁 cupcake
🥧 pie
🍫 chocolate_bar
🍬 candy
🍭 lollipop
🍮 custard
🍯 honey_pot
🍼 baby_bottle
🥛 milk_glass glass_of_milk
☕ coffee hot_beverage
🫖 teapot
🍵 tea teacup_without_handle
🍶 sake
🍾 champagne bottle_with_popping_cork
🍷 wine_glass
🍸 cocktail cocktail_glass
🍹 tropical_drink
🍺 beer beer_mug
🍻 beers clinking_beer_mugs
🥂 clinking_glasses
🥃 tumbler_glass
🫗 pouring_liquid
🥤 cup_with_straw
🧋 bubble_tea
🧃 beverage_box
🧉 mate mate_drink
🧊 ice_cube ice
🥢 chopsticks
🍽️ plate_with_cutlery fork_and_knife_with_plate knife_fork_plate
🍴 fork_and_knife
🥄 spoon
🔪 hocho knife kitchen_knife
🫙 jar
🏺 amphora
🌍 earth_africa globe_showing_europe_africa
🌎 earth_americas globe_showing_americas
🌏 earth_asia globe_showing_asia_australia
🌐 globe_with_meridians
🗺️ world_map
🗾 japan map_of_japan
🧭 compass
🏔️ mountain_snow snow_capped_mountain
⛰️ mountain
🌋 volcano
🗻 mount_fuji
🏕️ camping
🏖️ beach_umbrella beach_with_umbrella
🏜️ desert
🏝️ desert_island
🏞️ national_park
🏟️ stadium
🏛️ classical_building
🏗️ building_construction
🧱 bricks brick
🪨 rock
🪵 wood
🛖 hut
🏘️ houses house_buildings
🏚️ derelict_house derelict_house_building
🏠 house
🏡 house_with_garden
🏢 office office_building
🏣 post_office japanese_post_office
🏤 european_post_office
🏥 hospital
🏦 bank
🏨 hotel
🏩 love_hotel
🏪 convenience_store
🏫 school
🏬 department_store
🏭 factory
🏯 japanese_castle
🏰 european_castle castle
💒 wedding
🗼 tokyo_tower
🗽 statue_of_liberty
⛪ church
🕌 mosque
🛕 hindu_temple
🕍 synagogue
⛩️ shinto_shrine
🕋 kaaba
⛲ fountain
⛺ tent
🌁 foggy
🌃 night_with_stars
🏙️ cityscape
🌄 sunrise_over_mountains
🌅 sunrise
🌆 city_sunset cityscape_at_dusk
🌇 city_sunrise sunset
🌉 bridge_at_night
♨️ hotsprings hot_springs
🎠 carousel_horse
🛝 playground_slide
🎡 ferris_wheel
🎢 roller_coaster
💈 barber barber_pole
🎪 circus_tent
🚂 steam_locomotive locomotive
🚃 railway_car
🚄 bullettrain_side high_speed_train
🚅 bullettrain_front bullet_train
🚆 train2
🚇 metro
🚈 light_rail
🚉 station
🚊 tram
🚝 monorail
🚞 mountain_railway
🚋 train tram_car
🚌 bus
🚍 oncoming_bus
🚎 trolleybus
🚐 minibus
🚑 ambulance
🚒 fire_engine
🚓 police_car
🚔 oncoming_police_car
🚕 taxi
🚖 oncoming_taxi
🚗 car red_car automobile
🚘 oncoming_automobile
🚙 blue_car sport_utility_vehicle
🛻 pickup_truck
🚚 truck delivery_truck
🚛 articulated_lorry
🚜 tractor
🏎️ racing_car
🏍️ motorcycle racing_motorcycle
🛵 motor_scooter
🦽 manual_wheelchair
🦼 motorized_wheelchair
🛺 auto_rickshaw
🚲 bike bicycle
🛴 kick_scooter scooter
🛹 skateboard
🛼 roller_skate
🚏 busstop bus_stop
🛣️ motorway
🛤️ railway_track
🛢️ oil_drum
⛽ fuelpump fuel_pump
🛞 wheel
🚨 rotating_light police_car_light
🚥 traffic_light horizontal_traffic_light
🚦 vertical_traffic_light
🛑 stop_sign octagonal_sign
🚧 construction
⚓ anchor
🛟 ring_buoy
⛵ boat sailboat
🛶 canoe
🚤 speedboat
🛳️ passenger_ship
⛴️ ferry
🛥️ motor_boat
🚢 ship
✈️ airplane
🛩️ small_airplane
🛫 flight_departure airplane_departure
🛬 flight_arrival airplane_arrival airplane_arriving
🪂 parachute
💺 seat
🚁 helicopter
🚟 suspension_railway
🚠 mountain_cableway
🚡 aerial_tramway
🛰️ artificial_satellite
🚀 rocket
🛸 flying_saucer
🛎️ bellhop_bell
🧳 luggage
⌛ hourglass hourglass_done
⏳ hourglass_flowing_sand hourglass_not_done
⌚ watch
⏰ alarm_clock
⏱️ stopwatch
⏲️ timer_clock
🕰️ mantelpiece_clock
🕛 clock12 twelve_oclock
🕧 clock1230 twelve_thirty
🕐 clock1 one_oclock
🕜 clock130 one_thirty
🕑 clock2 two_oclock
🕝 clock230 two_thirty
🕒 clock3 three_oclock
🕞 clock330 three_thirty
🕓 clock4 four_oclock
🕟 clock430 four_thirty
🕔 clock5 five_oclock
🕠 clock530 five_thirty
🕕 clock6 six_oclock
🕡 clock630 six_thirty
🕖 clock7 seven_oclock
🕢 clock730 seven_thirty
🕗 clock8 eight_oclock
🕣 clock830 eight_thirty
🕘 clock9 nine_oclock
🕤 clock930 nine_thirty
🕙 clock10 ten_oclock
🕥 clock1030 ten_thirty
🕚 clock11 eleven_oclock
🕦 clock1130 eleven_thirty
🌑 new_moon
🌒 waxing_crescent_moon
🌓 first_quarter_moon
🌔 moon waxing_gibbous_moon
🌕 full_moon
🌖 waning_gibbous_moon
🌗 last_quarter_moon
🌘 waning_crescent_moon
🌙 crescent_moon
🌚 new_moon_with_face new_moon_face
🌛 first_quarter_moon_with_face first_quarter_moon_face
🌜 last_quarter_moon_with_face last_quarter_moon_face
🌡️ thermometer
☀️ sunny sun
🌝 full_moon_with_face full_moon_face
🌞 sun_with_face
🪐 ringed_planet
⭐ star
🌟 star2 glowing_star
🌠 stars shooting_star
🌌 milky_way
☁️ cloud
⛅ partly_sunny sun_behind_cloud
⛈️ cloud_with_lightning_and_rain thunder_cloud_and_rain
🌤️ sun_behind_small_cloud mostly_sunny sun_small_cloud
🌥️ sun_behind_large_cloud barely_sunny
🌦️ sun_behind_rain_cloud partly_sunny_rain
🌧️ cloud_with_rain rain_cloud
🌨️ cloud_with_snow snow_cloud
🌩️ cloud_with_lightning lightning lightning_cloud
🌪️ tornado tornado_cloud
🌫️ fog
🌬️ wind_face wind_blowing_face
🌀 cyclone
🌈 rainbow
🌂 closed_umbrella
☂️ open_umbrella
☔ umbrella umbrella_with_rain_drops
⛱️ parasol_on_ground umbrella_on_ground
⚡ zap high_voltage
❄️ snowflake
☃️ snowman_with_snow
⛄ snowman snowman_without_snow
☄️ comet
🔥 fire
💧 droplet
🌊 ocean water_wave
🎃 jack_o_lantern
🎄 christmas_tree
🎆 fireworks
🎇 sparkler
🧨 firecracker
✨ sparkles
🎈 balloon
🎉 tada party_popper
🎊 confetti_ball
🎋 tanabata_tree
🎍 bamboo pine_decoration
🎎 dolls japanese_dolls
🎏 flags carp_streamer
🎐 wind_chime
🎑 rice_scene moon_viewing_ceremony
🧧 red_envelope
🎀 ribbon
🎁 gift wrapped_gift
🎗️ reminder_ribbon
🎟️ tickets admission_tickets
🎫 ticket
🎖️ medal_military military_medal medal
🏆 trophy
🏅 medal_sports sports_medal
🥇 1st_place_medal first_place_medal
🥈 2nd_place_medal second_place_medal
🥉 3rd_place_medal third_place_medal
⚽ soccer soccer_ball
⚾ baseball
🥎 softball
🏀 basketball
🏐 volleyball
🏈 football american_football
🏉 rugby_football
🎾 tennis
🥏 flying_disc
🎳 bowling
🏏 cricket_game cricket_bat_and_ball
🏑 field_hockey field_hockey_stick_and_ball
🏒 ice_hockey ice_hockey_stick_and_puck
🥍 lacrosse
🏓 ping_pong table_tennis_paddle_and_ball
🏸 badminton badminton_racquet_and_shuttlecock
🥊 boxing_glove
🥋 martial_arts_uniform
🥅 goal_net
⛳ golf flag_in_hole
⛸️ ice_skate
🎣 fishing_pole_and_fish fishing_pole
🤿 diving_mask
🎽 running_shirt_with_sash running_shirt
🎿 ski skis
🛷 sled
🥌 curling_stone
🎯 dart bullseye
🪀 yo_yo yo-yo
🪁 kite
🔫 gun water_pistol
🎱 8ball pool_8_ball
🔮 crystal_ball
🪄 magic_wand
🎮 video_game
🕹️ joystick
🎰 slot_machine
🎲 game_die
🧩 jigsaw puzzle_piece
🧸 teddy_bear
🪅 pinata
🪩 mirror_ball
🪆 nesting_dolls
♠️ spades spade_suit
♥️ hearts heart_suit
♦️ diamonds diamond_suit
♣️ clubs club_suit
♟️ chess_pawn
🃏 black_joker joker
🀄 mahjong mahjong_red_dragon
🎴 flower_playing_cards
🎭 performing_arts
🖼️ framed_picture frame_with_picture
🎨 art artist_palette
🧵 thread
🪡 sewing_needle
🧶 yarn
🪢 knot
👓 eyeglasses glasses
🕶️ dark_sunglasses
🥽 goggles
🥼 lab_coat
🦺 safety_vest
👔 necktie
👕 shirt tshirt t_shirt
👖 jeans
🧣 scarf
🧤 gloves
🧥 coat
🧦 socks
👗 dress
👘 kimono
🥻 sari
🩱 one_piece_swimsuit one-piece_swimsuit
🩲 swim_brief briefs
🩳 shorts
👙 bikini
👚 womans_clothes
🪭 folding_hand_fan
👛 purse
👜 handbag
👝 pouch clutch_bag
🛍️ shopping shopping_bags
🎒 school_satchel backpack
🩴 thong_sandal
👞 mans_shoe shoe
👟 athletic_shoe running_shoe
🥾 hiking_boot
🥿 flat_shoe womans_flat_shoe
👠 high_heel high_heeled_shoe
👡 sandal womans_sandal
🩰 ballet_shoes
👢 boot womans_boot
🪮 hair_pick
👑 crown
👒 womans_hat
🎩 tophat top_hat
🎓 mortar_board graduation_cap
🧢 billed_cap
🪖 military_helmet
⛑️ rescue_worker_helmet rescue_workers_helmet helmet_with_white_cross
📿 prayer_beads
💄 lipstick
💍 ring
💎 gem gem_stone
🔇 mute muted_speaker
🔈 speaker speaker_low_volume
🔉 sound speaker_medium_volume
🔊 loud_sound speaker_high_volume
📢 loudspeaker
📣 mega megaphone
📯 postal_horn
🔔 bell
🔕 no_bell bell_with_slash
🎼 musical_score
🎵 musical_note
🎶 notes musical_notes
🎙️ studio_microphone
🎚️ level_slider
🎛️ control_knobs
🎤 microphone
🎧 headphones headphone
📻 radio
🎷 saxophone
🪗 accordion
🎸 guitar
🎹 musical_keyboard
🎺 trumpet
🎻 violin
🪕 banjo
🥁 drum drum_with_drumsticks
🪘 long_drum
🪇 maracas
🪈 flute
📱 iphone mobile_phone
📲 calling mobile_phone_with_arrow
☎️ phone telephone
📞 telephone_receiver
📟 pager
📠 fax fax_machine
🔋 battery
🪫 low_battery
🔌 electric_plug
💻 computer laptop
🖥️ desktop_computer
🖨️ printer
⌨️ keyboard
🖱️ computer_mouse three_button_mouse
🖲️ trackball
💽 minidisc computer_disk
💾 floppy_disk
💿 cd optical_disk
📀 dvd
🧮 abacus
🎥 movie_camera
🎞️ film_strip film_frames
📽️ film_projector
🎬 clapper clapper_board
📺 tv television
📷 camera
📸 camera_flash camera_with_flash
📹 video_camera
📼 vhs videocassette
🔍 mag magnifying_glass_tilted_left
🔎 mag_right magnifying_glass_tilted_right
🕯️ candle
💡 bulb light_bulb
🔦 flashlight
🏮 izakaya_lantern lantern red_paper_lantern
🪔 diya_lamp
📔 notebook_with_decorative_cover
📕 closed_book
📖 book open_book
📗 green_book
📘 blue_book
📙 orange_book
📚 books
📓 notebook
📒 ledger
📃 page_with_curl
📜 scroll
📄 page_facing_up
📰 newspaper
🗞️ newspaper_roll rolled_up_newspaper
📑 bookmark_tabs
🔖 bookmark
🏷️ label
💰 moneybag money_bag
🪙 coin
💴 yen yen_banknote
💵 dollar dollar_banknote
💶 euro euro_banknote
💷 pound pound_banknote
💸 money_with_wings
💳 credit_card
🧾 receipt
💹 chart chart_increasing_with_yen
✉️ envelope
📧 email e-mail
📨 incoming_envelope
📩 envelope_with_arrow
📤 outbox_tray
📥 inbox_tray
📦 package
📫 mailbox closed_mailbox_with_raised_flag
📪 mailbox_closed closed_mailbox_with_lowered_flag
📬 mailbox_with_mail open_mailbox_with_raised_flag
📭 mailbox_with_no_mail open_mailbox_with_lowered_flag
📮 postbox
🗳️ ballot_box ballot_box_with_ballot
✏️ pencil2
✒️ black_nib
🖋️ fountain_pen lower_left_fountain_pen
🖊️ pen lower_left_ballpoint_pen
🖌️ paintbrush lower_left_paintbrush
🖍️ crayon lower_left_crayon
📝 memo pencil
💼 briefcase
📁 file_folder
📂 open_file_folder
🗂️ card_index_dividers
📅 date
📆 calendar tear_off_calendar
🗒️ spiral_notepad spiral_note_pad
🗓️ spiral_calendar spiral_calendar_pad
📇 card_index
📈 chart_with_upwards_trend chart_increasing
📉 chart_with_downwards_trend chart_decreasing
📊 bar_chart
📋 clipboard
📌 pushpin
📍 round_pushpin
📎 paperclip
🖇️ paperclips linked_paperclips
📏 straight_ruler
📐 triangular_ruler
✂️ scissors
🗃️ card_file_box
🗄️ file_cabinet
🗑️ wastebasket
🔒 lock locked
🔓 unlock unlocked
🔏 lock_with_ink_pen locked_with_pen
🔐 closed_lock_with_key locked_with_key
🔑 key
🗝️ old_key
🔨 hammer
🪓 axe
⛏️ pick
⚒️ hammer_and_pick
🛠️ hammer_and_wrench
🗡️ dagger dagger_knife
⚔️ crossed_swords
💣 bomb
🪃 boomerang
🏹 bow_and_arrow
🛡️ shield
🪚 carpentry_saw
🔧 wrench
🪛 screwdriver
🔩 nut_and_bolt
⚙️ gear
🗜️ clamp compression
⚖️ balance_scale scales
🦯 probing_cane white_cane
🔗 link
⛓️ chains
🪝 hook
🧰 toolbox
🧲 magnet
🪜 ladder
⚗️ alembic
🧪 test_tube
🧫 petri_dish
🧬 dna
🔬 microscope
🔭 telescope
📡 satellite satellite_antenna
💉 syringe
🩸 drop_of_blood
💊 pill
🩹 adhesive_bandage
🩼 crutch
🩺 stethoscope
🩻 x_ray x-ray
🚪 door
🛗 elevator
🪞 mirror
🪟 window
🛏️ bed
🛋️ couch_and_lamp
🪑 chair
🚽 toilet
🪠 plunger
🚿 shower
🛁 bathtub
🪤 mouse_trap
🪒 razor
🧴 lotion_bottle
🧷 safety_pin
🧹 broom
🧺 basket
🧻 roll_of_paper
🪣 bucket
🧼 soap
🫧 bubbles
🪥 toothbrush
🧽 sponge
🧯 fire_extinguisher
🛒 shopping_cart shopping_trolley
🚬 smoking cigarette
⚰️ coffin
🪦 headstone
⚱️ funeral_urn
🧿 nazar_amulet
🪬 hamsa
🗿 moyai moai
🪧 placard
🪪 identification_card
🏧 atm atm_sign
🚮 put_litter_in_its_place litter_in_bin_sign
🚰 potable_water
♿ wheelchair wheelchair_symbol
🚹 mens mens_room
🚺 womens womens_room
🚻 restroom
🚼 baby_symbol
🚾 wc water_closet
🛂 passport_control
🛃 customs
🛄 baggage_claim
🛅 left_luggage
⚠️ warning
🚸 children_crossing
⛔ no_entry
🚫 no_entry_sign prohibited
🚳 no_bicycles
🚭 no_smoking
🚯 do_not_litter no_littering
🚱 non-potable_water non_potable_water
🚷 no_pedestrians
📵 no_mobile_phones
🔞 underage no_one_under_eighteen
☢️ radioactive radioactive_sign
☣️ biohazard biohazard_sign
⬆️ arrow_up up_arrow
↗️ arrow_upper_right up_right_arrow
➡️ arrow_right right_arrow
↘️ arrow_lower_right down_right_arrow
⬇️ arrow_down down_arrow
↙️ arrow_lower_left down_left_arrow
⬅️ arrow_left left_arrow
↖️ arrow_upper_left up_left_arrow
↕️ arrow_up_down up_down_arrow
↔️ left_right_arrow
↩️ leftwards_arrow_with_hook right_arrow_curving_left
↪️ arrow_right_hook left_arrow_curving_right
⤴️ arrow_heading_up right_arrow_curving_up
⤵️ arrow_heading_down right_arrow_curving_down
🔃 arrows_clockwise clockwise_vertical_arrows
🔄 arrows_counterclockwise counterclockwise_arrows_button
🔙 back back_arrow
🔚 end end_arrow
🔛 on on_arrow
🔜 soon soon_arrow
🔝 top top_arrow
🛐 place_of_worship
⚛️ atom_symbol
🕉️ om om_symbol
✡️ star_of_david
☸️ wheel_of_dharma
☯️ yin_yang
✝️ latin_cross
☦️ orthodox_cross
☪️ star_and_crescent
☮️ peace_symbol
🕎 menorah menorah_with_nine_branches
🔯 six_pointed_star dotted_six_pointed_star
🪯 khanda
♈ aries
♉ taurus
♊ gemini
♋ cancer
♌ leo
♍ virgo
♎ libra
♏ scorpius scorpio
♐ sagittarius
♑ capricorn
♒ aquarius
♓ pisces
⛎ ophiuchus
🔀 twisted_rightwards_arrows shuffle_tracks_button
🔁 repeat repeat_button
🔂 repeat_one repeat_single_button
▶️ arrow_forward play_button
⏩ fast_forward fast_forward_button
⏭️ next_track_button black_right_pointing_double_triangle_with_vertical_bar
⏯️ play_or_pause_button black_right_pointing_triangle_with_double_vertical_bar
◀️ arrow_backward reverse_button
⏪ rewind fast_reverse_button
⏮️ previous_track_button last_track_button black_left_pointing_double_triangle_with_vertical_bar
🔼 arrow_up_small upwards_button
⏫ arrow_double_up fast_up_button
🔽 arrow_down_small downwards_button
⏬ arrow_double_down fast_down_button
⏸️ pause_button double_vertical_bar
⏹️ stop_button black_square_for_stop
⏺️ record_button black_circle_for_record
⏏️ eject_button eject
🎦 cinema
🔅 low_brightness dim_button
🔆 high_brightness bright_button
📶 signal_strength antenna_bars
🛜 wireless
📳 vibration_mode
📴 mobile_phone_off
♀️ female_sign
♂️ male_sign
⚧️ transgender_symbol
✖️ heavy_multiplication_x multiply
➕ heavy_plus_sign plus
➖ heavy_minus_sign minus
➗ heavy_division_sign divide
🟰 heavy_equals_sign
♾️ infinity
‼️ bangbang double_exclamation_mark
⁉️ interrobang exclamation_question_mark
❓ question red_question_mark
❔ grey_question white_question_mark
❕ grey_exclamation white_exclamation_mark
❗ exclamation heavy_exclamation_mark red_exclamation_mark
〰️ wavy_dash
💱 currency_exchange
💲 heavy_dollar_sign
⚕️ medical_symbol staff_of_aesculapius
♻️ recycle recycling_symbol
⚜️ fleur_de_lis
🔱 trident trident_emblem
📛 name_badge
🔰 beginner japanese_symbol_for_beginner
⭕ o hollow_red_circle
✅ white_check_mark check_mark_button
☑️ ballot_box_with_check check_box_with_check
✔️ heavy_check_mark check_mark
❌ x cross_mark
❎ negative_squared_cross_mark cross_mark_button
➰ curly_loop
➿ loop double_curly_loop
〽️ part_alternation_mark
✳️ eight_spoked_asterisk
✴️ eight_pointed_black_star eight_pointed_star
❇️ sparkle
©️ copyright
®️ registered
™️ tm trade_mark
#️⃣ hash keycap_number_sign
*️⃣ asterisk keycap_asterisk keycap_star
0️⃣ zero keycap_0
1️⃣ one keycap_1
2️⃣ two keycap_2
3️⃣ three keycap_3
4️⃣ four keycap_4
5️⃣ five keycap_5
6️⃣ six keycap_6
7️⃣ seven keycap_7
8️⃣ eight keycap_8
9️⃣ nine keycap_9
🔟 keycap_ten keycap_10
🔠 capital_abcd input_latin_uppercase
🔡 abcd input_latin_lowercase
🔢 1234 input_numbers
🔣 symbols input_symbols
🔤 abc input_latin_letters
🅰️ a a_button_blood_type
🆎 ab ab_button_blood_type
🅱️ b b_button_blood_type
🆑 cl cl_button
🆒 cool cool_button
🆓 free free_button
ℹ️ information_source information
🆔 id id_button
Ⓜ️ m circled_m
🆕 new new_button
🆖 ng ng_button
🅾️ o2 o_button_blood_type
🆗 ok ok_button
🅿️ parking p_button
🆘 sos sos_button
🆙 up up_button
🆚 vs vs_button
🈁 koko japanese_here_button
🈂️ sa japanese_service_charge_button
🈷️ u6708 japanese_monthly_amount_button
🈶 u6709 japanese_not_free_of_charge_button
🈯 u6307 japanese_reserved_button
🉐 ideograph_advantage japanese_bargain_button
🈹 u5272 japanese_discount_button
🈚 u7121 japanese_free_of_charge_button
🈲 u7981 japanese_prohibited_button
🉑 accept japanese_acceptable_button
🈸 u7533 japanese_application_button
🈴 u5408 japanese_passing_grade_button
🈳 u7a7a japanese_vacancy_button
㊗️ congratulations japanese_congratulations_button
㊙️ secret japanese_secret_button
🈺 u55b6 japanese_open_for_business_button
🈵 u6e80 japanese_no_vacancy_button
🔴 red_circle
🟠 orange_circle large_orange_circle
🟡 yellow_circle large_yellow_circle
🟢 green_circle large_green_circle
🔵 large_blue_circle blue_circle
🟣 purple_circle large_purple_circle
🟤 brown_circle large_brown_circle
⚫ black_circle
⚪ white_circle
🟥 red_square large_red_square
🟧 orange_square large_orange_square
🟨 yellow_square large_yellow_square
🟩 green_square large_green_square
🟦 blue_square large_blue_square
🟪 purple_square large_purple_square
🟫 brown_square large_brown_square
⬛ black_large_square
⬜ white_large_square
◼️ black_medium_square
◻️ white_medium_square
◾ black_medium_small_square
◽ white_medium_small_square
▪️ black_small_square
▫️ white_small_square
🔶 large_orange_diamond
🔷 large_blue_diamond
🔸 small_orange_diamond
🔹 small_blue_diamond
🔺 small_red_triangle red_triangle_pointed_up
🔻 small_red_triangle_down red_triangle_pointed_down
💠 diamond_shape_with_a_dot_inside diamond_with_a_dot
🔘 radio_button
🔳 white_square_button
🔲 black_square_button
🏁 checkered_flag chequered_flag
🚩 triangular_flag_on_post triangular_flag
🎌 crossed_flags
🏴 black_flag waving_black_flag
🏳️ white_flag waving_white_flag
🏳️‍🌈 rainbow_flag rainbow-flag
🏳️‍⚧️ transgender_flag
🏴‍☠️ pirate_flag
🇦🇨 ascension_island flag_ascension_island flag-ac
🇦🇩 andorra flag_andorra flag-ad
🇦🇪 united_arab_emirates flag_united_arab_emirates flag-ae
🇦🇫 afghanistan flag_afghanistan flag-af
🇦🇬 antigua_barbuda flag_antigua_barbuda flag-ag
🇦🇮 anguilla flag_anguilla flag-ai
🇦🇱 albania flag_albania flag-al
🇦🇲 armenia flag_armenia flag-am
🇦🇴 angola flag_angola flag-ao
🇦🇶 antarctica flag_antarctica flag-aq
🇦🇷 argentina flag_argentina flag-ar
🇦🇸 american_samoa flag_american_samoa flag-as
🇦🇹 austria flag_austria flag-at
🇦🇺 australia flag_australia flag-au
🇦🇼 aruba flag_aruba flag-aw
🇦🇽 aland_islands flag_aland_islands flag-ax
🇦🇿 azerbaijan flag_azerbaijan flag-az
🇧🇦 bosnia_herzegovina flag_bosnia_herzegovina flag-ba
🇧🇧 barbados flag_barbados flag-bb
🇧🇩 bangladesh flag_bangladesh flag-bd
🇧🇪 belgium flag_belgium flag-be
🇧🇫 burkina_faso flag_burkina_faso flag-bf
🇧🇬 bulgaria flag_bulgaria flag-bg
🇧🇭 bahrain flag_bahrain flag-bh
🇧🇮 burundi flag_burundi flag-bi
🇧🇯 benin flag_benin flag-bj
🇧🇱 st_barthelemy flag_st_barthelemy flag-bl
🇧🇲 bermuda flag_bermuda flag-bm
🇧🇳 brunei flag_brunei flag-bn
🇧🇴 bolivia flag_bolivia flag-bo
🇧🇶 caribbean_netherlands flag_caribbean_netherlands flag-bq
🇧🇷 brazil flag_brazil flag-br
🇧🇸 bahamas flag_bahamas flag-bs
🇧🇹 bhutan flag_bhutan flag-bt
🇧🇻 bouvet_island flag_bouvet_island flag-bv
🇧🇼 botswana flag_botswana flag-bw
🇧🇾 belarus flag_belarus flag-by
🇧🇿 belize flag_belize flag-bz
🇨🇦 canada flag_canada flag-ca
🇨🇨 cocos_islands flag_cocos_keeling_islands flag-cc
🇨🇩 congo_kinshasa flag_congo_kinshasa flag-cd
🇨🇫 central_african_republic flag_central_african_republic flag-cf
🇨🇬 congo_brazzaville flag_congo_brazzaville flag-cg
🇨🇭 switzerland flag_switzerland flag-ch
🇨🇮 cote_divoire flag_cote_divoire flag-ci
🇨🇰 cook_islands flag_cook_islands flag-ck
🇨🇱 chile flag_chile flag-cl
🇨🇲 cameroon flag_cameroon flag-cm
🇨🇳 cn flag_china flag-cn
🇨🇴 colombia flag_colombia flag-co
🇨🇵 clipperton_island flag_clipperton_island flag-cp
🇨🇷 costa_rica flag_costa_rica flag-cr
🇨🇺 cuba flag_cuba flag-cu
🇨🇻 cape_verde flag_cape_verde flag-cv
🇨🇼 curacao flag_curacao flag-cw
🇨🇽 christmas_island flag_christmas_island flag-cx
🇨🇾 cyprus flag_cyprus flag-cy
🇨🇿 czech_republic flag_czechia flag-cz
🇩🇪 de flag_germany flag-de
🇩🇬 diego_garcia flag_diego_garcia flag-dg
🇩🇯 djibouti flag_djibouti flag-dj
🇩🇰 denmark flag_denmark flag-dk
🇩🇲 dominica flag_dominica flag-dm
🇩🇴 dominican_republic flag_dominican_republic flag-do
🇩🇿 algeria flag_algeria flag-dz
🇪🇦 ceuta_melilla flag_ceuta_melilla flag-ea
🇪🇨 ecuador flag_ecuador flag-ec
🇪🇪 estonia flag_estonia flag-ee
🇪🇬 egypt flag_egypt flag-eg
🇪🇭 western_sahara flag_western_sahara flag-eh
🇪🇷 eritrea flag_eritrea flag-er
🇪🇸 es flag_spain flag-es
🇪🇹 ethiopia flag_ethiopia flag-et
🇪🇺 eu european_union flag_european_union flag-eu
🇫🇮 finland flag_finland flag-fi
🇫🇯 fiji flag_fiji flag-fj
🇫🇰 falkland_islands flag_falkland_islands flag-fk
🇫🇲 micronesia flag_micronesia flag-fm
🇫🇴 faroe_islands flag_faroe_islands flag-fo
🇫🇷 fr flag_france flag-fr
🇬🇦 gabon flag_gabon flag-ga
🇬🇧 gb uk flag_united_kingdom flag-gb
🇬🇩 grenada flag_grenada flag-gd
🇬🇪 georgia flag_georgia flag-ge
🇬🇫 french_guiana flag_french_guiana flag-gf
🇬🇬 guernsey flag_guernsey flag-gg
🇬🇭 ghana flag_ghana flag-gh
🇬🇮 gibraltar flag_gibraltar flag-gi
🇬🇱 greenland flag_greenland flag-gl
🇬🇲 gambia flag_gambia flag-gm
🇬🇳 guinea flag_guinea flag-gn
🇬🇵 guadeloupe flag_guadeloupe flag-gp
🇬🇶 equatorial_guinea flag_equatorial_guinea flag-gq
🇬🇷 greece flag_greece flag-gr
🇬🇸 south_georgia_south_sandwich_islands flag_south_georgia_south_sandwich_islands flag-gs
🇬🇹 guatemala flag_guatemala flag-gt
🇬🇺 guam flag_guam flag-gu
🇬🇼 guinea_bissau flag_guinea_bissau flag-gw
🇬🇾 guyana flag_guyana flag-gy
🇭🇰 hong_kong flag_hong_kong_sar_china flag-hk
🇭🇲 heard_mcdonald_islands flag_heard_island_mcdonald_islands flag-hm
🇭🇳 honduras flag_honduras flag-hn
🇭🇷 croatia flag_croatia flag-hr
🇭🇹 haiti flag_haiti flag-ht
🇭🇺 hungary flag_hungary flag-hu
🇮🇨 canary_islands flag_canary_islands flag-ic
🇮🇩 indonesia flag_indonesia flag-id
🇮🇪 ireland flag_ireland flag-ie
🇮🇱 israel flag_israel flag-il
🇮🇲 isle_of_man flag_isle_of_man flag-im
🇮🇳 india flag_india flag-in
🇮🇴 british_indian_ocean_territory flag_british_indian_ocean_territory flag-io
🇮🇶 iraq flag_iraq flag-iq
🇮🇷 iran flag_iran flag-ir
🇮🇸 iceland flag_iceland flag-is
🇮🇹 it flag_italy flag-it
🇯🇪 jersey flag_jersey flag-je
🇯🇲 jamaica flag_jamaica flag-jm
🇯🇴 jordan flag_jordan flag-jo
🇯🇵 jp flag_japan flag-jp
🇰🇪 kenya flag_kenya flag-ke
🇰🇬 kyrgyzstan flag_kyrgyzstan flag-kg
🇰🇭 cambodia flag_cambodia flag-kh
🇰🇮 kiribati flag_kiribati flag-ki
🇰🇲 comoros flag_comoros flag-km
🇰🇳 st_kitts_nevis flag_st_kitts_nevis flag-kn
🇰🇵 north_korea flag_north_korea flag-kp
🇰🇷 kr flag_south_korea flag-kr
🇰🇼 kuwait flag_kuwait flag-kw
🇰🇾 cayman_islands flag_cayman_islands flag-ky
🇰🇿 kazakhstan flag_kazakhstan flag-kz
🇱🇦 laos flag_laos flag-la
🇱🇧 lebanon flag_lebanon flag-lb
🇱🇨 st_lucia flag_st_lucia flag-lc
🇱🇮 liechtenstein flag_liechtenstein flag-li
🇱🇰 sri_lanka flag_sri_lanka flag-lk
🇱🇷 liberia flag_liberia flag-lr
🇱🇸 lesotho flag_lesotho flag-ls
🇱🇹 lithuania flag_lithuania flag-lt
🇱🇺 luxembourg flag_luxembourg flag-lu
🇱🇻 latvia flag_latvia flag-lv
🇱🇾 libya flag_libya flag-ly
🇲🇦 morocco flag_morocco flag-ma
🇲🇨 monaco flag_monaco flag-mc
🇲🇩 moldova flag_moldova flag-md
🇲🇪 montenegro flag_montenegro flag-me
🇲🇫 st_martin flag_st_martin flag-mf
🇲🇬 madagascar flag_madagascar flag-mg
🇲🇭 marshall_islands flag_marshall_islands flag-mh
🇲🇰 macedonia flag_north_macedonia flag-mk
🇲🇱 mali flag_mali flag-ml
🇲🇲 myanmar flag_myanmar_burma flag-mm
🇲🇳 mongolia flag_mongolia flag-mn
🇲🇴 macau flag_macao_sar_china flag-mo
🇲🇵 northern_mariana_islands flag_northern_mariana_islands flag-mp
🇲🇶 martinique flag_martinique flag-mq
🇲🇷 mauritania flag_mauritania flag-mr
🇲🇸 montserrat flag_montserrat flag-ms
🇲🇹 malta flag_malta flag-mt
🇲🇺 mauritius flag_mauritius flag-mu
🇲🇻 maldives flag_maldives flag-mv
🇲🇼 malawi flag_malawi flag-mw
🇲🇽 mexico flag_mexico flag-mx
🇲🇾 malaysia flag_malaysia flag-my
🇲🇿 mozambique flag_mozambique flag-mz
🇳🇦 namibia flag_namibia flag-na
🇳🇨 new_caledonia flag_new_caledonia flag-nc
🇳🇪 niger flag_niger flag-ne
🇳🇫 norfolk_island flag_norfolk_island flag-nf
🇳🇬 nigeria flag_nigeria flag-ng
🇳🇮 nicaragua flag_nicaragua flag-ni
🇳🇱 netherlands flag_netherlands flag-nl
🇳🇴 norway flag_norway flag-no
🇳🇵 nepal flag_nepal flag-np
🇳🇷 nauru flag_nauru flag-nr
🇳🇺 niue flag_niue flag-nu
🇳🇿 new_zealand flag_new_zealand flag-nz
🇴🇲 oman flag_oman flag-om
🇵🇦 panama flag_panama flag-pa
🇵🇪 peru flag_peru flag-pe
🇵🇫 french_polynesia flag_french_polynesia flag-pf
🇵🇬 papua_new_guinea flag_papua_new_guinea flag-pg
🇵🇭 philippines flag_philippines flag-ph
🇵🇰 pakistan flag_pakistan flag-pk
🇵🇱 poland flag_poland flag-pl
🇵🇲 st_pierre_miquelon flag_st_pierre_miquelon flag-pm
🇵🇳 pitcairn_islands flag_pitcairn_islands flag-pn
🇵🇷 puerto_rico flag_puerto_rico flag-pr
🇵🇸 palestinian_territories flag_palestinian_territories flag-ps
🇵🇹 portugal flag_portugal flag-pt
🇵🇼 palau flag_palau flag-pw
🇵🇾 paraguay flag_paraguay flag-py
🇶🇦 qatar flag_qatar flag-qa
🇷🇪 reunion flag_reunion flag-re
🇷🇴 romania flag_romania flag-ro
🇷🇸 serbia flag_serbia flag-rs
🇷🇺 ru flag_russia flag-ru
🇷🇼 rwanda flag_rwanda flag-rw
🇸🇦 saudi_arabia flag_saudi_arabia flag-sa
🇸🇧 solomon_islands flag_solomon_islands flag-sb
🇸🇨 seychelles flag_seychelles flag-sc
🇸🇩 sudan flag_sudan flag-sd
🇸🇪 sweden flag_sweden flag-se
🇸🇬 singapore flag_singapore flag-sg
🇸🇭 st_helena flag_st_helena_ascension_tristan_da_cunha flag-sh
🇸🇮 slovenia flag_slovenia flag-si
🇸🇯 svalbard_jan_mayen flag_svalbard_jan_mayen flag-sj
🇸🇰 slovakia flag_slovakia flag-sk
🇸🇱 sierra_leone flag_sierra_leone flag-sl
🇸🇲 san_marino flag_san_marino flag-sm
🇸🇳 senegal flag_senegal flag-sn
🇸🇴 somalia flag_somalia flag-so
🇸🇷 suriname flag_suriname flag-sr
🇸🇸 south_sudan flag_south_sudan flag-ss
🇸🇹 sao_tome_principe flag_sao_tome_principe flag-st
🇸🇻 el_salvador flag_el_salvador flag-sv
🇸🇽 sint_maarten flag_sint_maarten flag-sx
🇸🇾 syria flag_syria flag-sy
🇸🇿 swaziland flag_eswatini flag-sz
🇹🇦 tristan_da_cunha flag_tristan_da_cunha flag-ta
🇹🇨 turks_caicos_islands flag_turks_caicos_islands flag-tc
🇹🇩 chad flag_chad flag-td
🇹🇫 french_southern_territories flag_french_southern_and_antarctic_lands flag-tf
🇹🇬 togo flag_togo flag-tg
🇹🇭 thailand flag_thailand flag-th
🇹🇯 tajikistan flag_tajikistan flag-tj
🇹🇰 tokelau flag_tokelau flag-tk
🇹🇱 timor_leste flag_timor_leste flag-tl
🇹🇲 turkmenistan flag_turkmenistan flag-tm
🇹🇳 tunisia flag_tunisia flag-tn
🇹🇴 tonga flag_tonga flag-to
🇹🇷 tr flag_turkiye flag-tr
🇹🇹 trinidad_tobago flag_trinidad_tobago flag-tt
🇹🇻 tuvalu flag_tuvalu flag-tv
🇹🇼 taiwan flag_taiwan flag-tw
🇹🇿 tanzania flag_tanzania flag-tz
🇺🇦 ukraine flag_ukraine flag-ua
🇺🇬 uganda flag_uganda flag-ug
🇺🇲 us_outlying_islands flag_us_outlying_islands flag-um
🇺🇳 united_nations flag_united_nations flag-un
🇺🇸 us flag_united_states flag-us
🇺🇾 uruguay flag_uruguay flag-uy
🇺🇿 uzbekistan flag_uzbekistan flag-uz
🇻🇦 vatican_city flag_vatican_city flag-va
🇻🇨 st_vincent_grenadines flag_st_vincent_grenadines flag-vc
🇻🇪 venezuela flag_venezuela flag-ve
🇻🇬 british_virgin_islands flag_british_virgin_islands flag-vg
🇻🇮 us_virgin_islands flag_us_virgin_islands flag-vi
🇻🇳 vietnam flag_vietnam flag-vn
🇻🇺 vanuatu flag_vanuatu flag-vu
🇼🇫 wallis_futuna flag_wallis_futuna flag-wf
🇼🇸 samoa flag_samoa flag-ws
🇽🇰 kosovo flag_kosovo flag-xk
🇾🇪 yemen flag_yemen flag-ye
🇾🇹 mayotte flag_mayotte flag-yt
🇿🇦 south_africa flag_south_africa flag-za
🇿🇲 zambia flag_zambia flag-zm
🇿🇼 zimbabwe flag_zimbabwe flag-zw
🏴󠁧󠁢󠁥󠁮󠁧󠁿 england flag_england flag-england
🏴󠁧󠁢󠁳󠁣󠁴󠁿 scotland flag_scotland flag-scotland
🏴󠁧󠁢󠁷󠁬󠁳󠁿 wales flag_wales flag-wales
🇦 regional_indicator_a
🇧 regional_indicator_b
🇨 regional_indicator_c
🇩 regional_indicator_d
🇪 regional_indicator_e
🇫 regional_indicator_f
🇬 regional_indicator_g
🇭 regional_indicator_h
🇮 regional_indicator_i
🇯 regional_indicator_j
🇰 regional_indicator_k
🇱 regional_indicator_l
🇲 regional_indicator_m
🇳 regional_indicator_n
🇴 regional_indicator_o
🇵 regional_indicator_p
🇶 regional_indicator_q
🇷 regional_indicator_r
🇸 regional_indicator_s
🇹 regional_indicator_t
🇺 regional_indicator_u
🇻 regional_indicator_v
🇼 regional_indicator_w
🇽 regional_indicator_x
🇾 regional_indicator_y
🇿 regional_indicator_z
🫫 cracking_face
🙂‍↔️ head_shaking_horizontally
🙂‍↕️ head_shaking_vertically
🫩 face_with_bags_under_eyes
🫪 distorted_face
🫯 fight_cloud
🫹 leftwards_thumb_sign
🫺 rightwards_thumb_sign
🫈 hairy_creature
🚶‍➡️ person_walking_facing_right
🚶‍♀️‍➡️ woman_walking_facing_right
🚶‍♂️‍➡️ man_walking_facing_right
🧎‍➡️ person_kneeling_facing_right
🧎‍♀️‍➡️ woman_kneeling_facing_right
🧎‍♂️‍➡️ man_kneeling_facing_right
🧑‍🦯‍➡️ person_with_white_cane_facing_right
👨‍🦯‍➡️ man_with_white_cane_facing_right
👩‍🦯‍➡️ woman_with_white_cane_facing_right
🧑‍🦼‍➡️ person_in_motorized_wheelchair_facing_right
👨‍🦼‍➡️ man_in_motorized_wheelchair_facing_right
👩‍🦼‍➡️ woman_in_motorized_wheelchair_facing_right
🧑‍🦽‍➡️ person_in_manual_wheelchair_facing_right
👨‍🦽‍➡️ man_in_manual_wheelchair_facing_right
👩‍🦽‍➡️ woman_in_manual_wheelchair_facing_right
🏃‍➡️ person_running_facing_right
🏃‍♀️‍➡️ woman_running_facing_right
🏃‍♂️‍➡️ man_running_facing_right
🧑‍🩰 ballet_dancer
🧑‍🧑‍🧒 family_adult_adult_child
🧑‍🧑‍🧒‍🧒 family_adult_adult_child_child
🧑‍🧒 family_adult_child
🧑‍🧒‍🧒 family_adult_child_child
🫆 fingerprint
🏻 light_skin_tone skin-tone-2
🏼 medium_light_skin_tone skin-tone-3
🏽 medium_skin_tone skin-tone-4
🏾 medium_dark_skin_tone skin-tone-5
🏿 dark_skin_tone skin-tone-6
🦰 red_hair
🦱 curly_hair
🦳 white_hair
🦲 bald
🐦‍🔥 phoenix
🫍 orca
🫌 monarch_butterfly
🪾 leafless_tree
🍋‍🟩 lime
🫝 pickle
🍄‍🟫 brown_mushroom
🫜 root_vegetable
🛘 landslide
🛙 lighthouse
🪋 meteor
🪊 trombone
🪉 harp
🪎 treasure_chest
🪌 eraser
🪍 net_with_handle
⛓️‍💥 broken_chain
🪏 shovel
🫟 splatter
🇨🇶 flag_sark flag-sark
`;

export const EMOJI = new Map();
for (const row of TABLE.trim().split('\n')) {
  const [ch, ...names] = row.split(' ');
  for (const n of names) EMOJI.set(n, ch);
}
