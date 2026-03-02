# DBスキーマ（最新版）

生成日時: 2026-03-02 14:25:03 JST
参照先: .env の DATABASE_URL
スキーマ: public

テーブル数: 32

## ad_details

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | integer | NO | nextval('ad_details_id_seq'::regclass) |
| media_name | character varying(255) | NO |  |
| contract_start_date | date | YES |  |
| contract_end_date | date | YES |  |
| contract_amount | integer | YES | 0 |
| amount_period | character varying(50) | YES |  |
| contract_method | text | YES |  |
| renewal_terms | text | YES |  |
| memo | text | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

主キー: id

インデックス:
- ad_details_media_name_key: CREATE UNIQUE INDEX ad_details_media_name_key ON public.ad_details USING btree (media_name)
- ad_details_pkey: CREATE UNIQUE INDEX ad_details_pkey ON public.ad_details USING btree (id)
- idx_ad_details_media_name: CREATE INDEX idx_ad_details_media_name ON public.ad_details USING btree (media_name)
- uq_ad_details_media_name: CREATE UNIQUE INDEX uq_ad_details_media_name ON public.ad_details USING btree (media_name)

---

## ats_settings

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | smallint | NO | 1 |
| kintone_subdomain | text | NO |  |
| kintone_app_id | text | NO |  |
| kintone_api_token | text | NO |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

主キー: id

インデックス:
- ats_settings_pkey: CREATE UNIQUE INDEX ats_settings_pkey ON public.ats_settings USING btree (id)

---

## candidate_app_profile_deprecated

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('candidate_app_profile_id_seq'::regclass) |
| candidate_id | bigint | NO |  |
| nationality | character varying | YES |  |
| japanese_level | character varying | YES |  |
| address_pref | character varying | YES |  |
| address_city | character varying | YES |  |
| address_detail | character varying | YES |  |
| final_education | character varying | YES |  |
| work_experience | text | YES |  |
| interview_memo_formatted | text | YES |  |
| current_income | character varying | YES |  |
| desired_income | character varying | YES |  |
| job_search_status | text | YES |  |
| desired_job_type | text | YES |  |
| desired_work_location | text | YES |  |
| reason_for_change | text | YES |  |
| strengths | text | YES |  |
| personality | text | YES |  |
| carrier_summary_sheet_url | text | YES |  |
| resume_url | text | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
| job_change_axis | text | YES |  |
| job_change_timing | text | YES |  |
| future_vision | text | YES |  |
| recommendation_text | text | YES |  |
| other_selection_status | text | YES |  |
| desired_interview_dates | text | YES |  |
| mandatory_interview_items | text | YES |  |
| shared_interview_date | text | YES |  |

主キー: id

インデックス:
- candidate_app_profile_candidate_id_key: CREATE UNIQUE INDEX candidate_app_profile_candidate_id_key ON public.candidate_app_profile_deprecated USING btree (candidate_id)
- candidate_app_profile_deprecated_pkey: CREATE UNIQUE INDEX candidate_app_profile_deprecated_pkey ON public.candidate_app_profile_deprecated USING btree (id)

---

## candidate_applications

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('candidate_applications_id_seq'::regclass) |
| candidate_id | bigint | NO |  |
| client_id | bigint | NO |  |
| kintone_sub_id | text | YES |  |
| job_title | text | YES |  |
| apply_route | text | YES |  |
| recommended_at | timestamp with time zone | YES |  |
| first_interview_set_at | timestamp with time zone | YES |  |
| first_interview_at | timestamp with time zone | YES |  |
| second_interview_set_at | timestamp with time zone | YES |  |
| second_interview_at | timestamp with time zone | YES |  |
| offer_date | timestamp with time zone | YES |  |
| close_expected_at | timestamp with time zone | YES |  |
| offer_accept_date | timestamp with time zone | YES |  |
| join_date | timestamp with time zone | YES |  |
| pre_join_withdraw_date | timestamp with time zone | YES |  |
| post_join_quit_date | timestamp with time zone | YES |  |
| stage_current | text | YES |  |
| is_quit_30 | boolean | YES |  |
| created_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |
| updated_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |
| selection_note | text | YES |  |
| pre_join_withdraw_reason | text | YES |  |
| post_join_quit_reason | text | YES |  |
| recommendation_text | text | YES |  |
| final_interview_set_at | date | YES |  |
| final_interview_at | date | YES |  |
| offer_at | date | YES |  |
| offer_accepted_at | date | YES |  |
| joined_at | date | YES |  |
| declined_after_offer_at | date | YES |  |
| declined_after_offer_reason | text | YES |  |
| early_turnover_at | date | YES |  |
| early_turnover_reason | text | YES |  |
| closing_forecast_at | date | YES |  |
| fee | integer | YES |  |
| note | text | YES |  |
| proposal_date | timestamp with time zone | YES |  |
| work_mode | character varying | YES |  |
| fee_rate | character varying | YES |  |
| selection_status | character varying | YES |  |
| recommendation_at | timestamp with time zone | YES |  |
| pre_join_decline_at | timestamp with time zone | YES |  |
| post_join_quit_at | timestamp with time zone | YES |  |
| closing_plan_date | date | YES |  |
| fee_amount | text | YES |  |
| declined_reason | text | YES |  |
| refund_amount | integer | YES |  |
| order_reported | boolean | YES | false |
| refund_reported | boolean | YES | false |

主キー: id

外部キー:
- candidate_applications_candidate_id_fkey: candidate_id -> candidates.id
- candidate_applications_client_id_fkey: client_id -> clients.id

インデックス:
- candidate_applications_pkey: CREATE UNIQUE INDEX candidate_applications_pkey ON public.candidate_applications USING btree (id)

---

## candidate_educations

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('candidate_educations_id_seq'::regclass) |
| candidate_id | bigint | NO |  |
| school_name | text | YES |  |
| department | text | YES |  |
| admission_date | date | YES |  |
| graduation_date | date | YES |  |
| graduation_status | text | YES |  |
| sequence | integer | YES | 0 |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

主キー: id

インデックス:
- candidate_educations_pkey: CREATE UNIQUE INDEX candidate_educations_pkey ON public.candidate_educations USING btree (id)

---

## candidate_tasks

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | integer | NO | nextval('candidate_tasks_id_seq'::regclass) |
| candidate_id | integer | NO |  |
| action_date | date | YES |  |
| action_note | text | YES |  |
| is_completed | boolean | YES | false |
| completed_at | timestamp without time zone | YES |  |
| created_at | timestamp without time zone | YES | now() |
| updated_at | timestamp without time zone | YES | now() |

主キー: id

外部キー:
- candidate_tasks_candidate_id_fkey: candidate_id -> candidates.id

インデックス:
- candidate_tasks_pkey: CREATE UNIQUE INDEX candidate_tasks_pkey ON public.candidate_tasks USING btree (id)
- idx_candidate_tasks_candidate_id: CREATE INDEX idx_candidate_tasks_candidate_id ON public.candidate_tasks USING btree (candidate_id)

---

## candidate_work_histories

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('candidate_work_histories_id_seq'::regclass) |
| candidate_id | bigint | NO |  |
| company_name | text | YES |  |
| department | text | YES |  |
| position | text | YES |  |
| join_date | date | YES |  |
| leave_date | date | YES |  |
| is_current | boolean | YES | false |
| job_description | text | YES |  |
| sequence | integer | YES | 0 |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

主キー: id

インデックス:
- candidate_work_histories_pkey: CREATE UNIQUE INDEX candidate_work_histories_pkey ON public.candidate_work_histories USING btree (id)

---

## candidates

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('candidates_id_seq'::regclass) |
| kintone_app_id | integer | YES |  |
| kintone_record_id | integer | YES |  |
| candidate_code | text | YES |  |
| advisor_user_id | bigint | YES |  |
| partner_user_id | bigint | YES |  |
| name | text | NO |  |
| name_kana | text | YES |  |
| gender | text | YES |  |
| birth_date | date | YES |  |
| age | integer | YES |  |
| final_education | text | YES |  |
| phone | text | YES |  |
| email | text | YES |  |
| postal_code | text | YES |  |
| address_pref | text | YES |  |
| address_city | text | YES |  |
| address_detail | text | YES |  |
| employment_status | text | YES |  |
| current_income | text | YES |  |
| desired_income | text | YES |  |
| first_interview_note | text | YES |  |
| career_motivation | text | YES |  |
| desired_location | text | YES |  |
| memo | text | YES |  |
| new_status | text | YES |  |
| first_schedule_fixed_at | timestamp with time zone | YES |  |
| first_contact_planned_at | timestamp with time zone | YES |  |
| first_contact_at | timestamp with time zone | YES |  |
| first_interview_attended | boolean | YES |  |
| is_effective_application | boolean | YES |  |
| created_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |
| updated_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |
| sms_sent_flag | boolean | YES |  |
| is_connected | boolean | YES |  |
| first_call_at | timestamp without time zone | YES |  |
| skills | text | YES |  |
| personality | text | YES |  |
| work_experience | text | YES |  |
| contact_preferred_time | text | YES |  |
| mandatory_interview_items | text | YES |  |
| apply_company_name | text | YES |  |
| apply_job_name | text | YES |  |
| apply_route_text | text | YES |  |
| application_note | text | YES |  |
| desired_job_type | text | YES |  |
| career_reason | text | YES |  |
| transfer_timing | text | YES |  |
| other_selection_status | text | YES |  |
| interview_preferred_date | text | YES |  |
| recommendation_text | text | YES |  |
| nationality | character varying(100) | YES |  |
| japanese_level | character varying(10) | YES |  |
| next_action_date | date | YES |  |
| next_action_note | text | YES |  |
| candidate_name | text | YES |  |
| candidate_kana | text | YES |  |
| company_name | text | YES |  |
| job_name | text | YES |  |
| work_location | text | YES |  |
| advisor_name | text | YES |  |
| caller_name | text | YES |  |
| partner_name | text | YES |  |
| introduction_chance | text | YES |  |
| phase | text | YES |  |
| registered_date | date | YES |  |
| registered_at | timestamp with time zone | YES |  |
| candidate_updated_at | timestamp with time zone | YES |  |
| media_registered_at | date | YES |  |
| source | text | YES |  |
| birthday | date | YES |  |
| education | text | YES |  |
| address | text | YES |  |
| city | text | YES |  |
| contact_time | text | YES |  |
| remarks | text | YES |  |
| memo_detail | text | YES |  |
| hearing_memo | text | YES |  |
| resume_status | text | YES |  |
| meeting_video_url | text | YES |  |
| resume_for_send | text | YES |  |
| work_history_for_send | text | YES |  |
| call_date | date | YES |  |
| schedule_confirmed_at | date | YES |  |
| recommendation_date | date | YES |  |
| valid_application | boolean | YES |  |
| phone_connected | boolean | YES |  |
| sms_sent | boolean | YES |  |
| sms_confirmed | boolean | YES |  |
| attendance_confirmed | boolean | YES |  |
| final_result | text | YES |  |
| order_amount | text | YES |  |
| after_acceptance_job_type | text | YES |  |
| line_reported | boolean | YES |  |
| personal_sheet_reflected | boolean | YES |  |
| invoice_sent | boolean | YES |  |
| cs_valid_confirmed | boolean | YES |  |
| cs_connect_confirmed | boolean | YES |  |
| refund_retirement_date | date | YES |  |
| refund_amount | text | YES |  |
| refund_report | text | YES |  |
| cs_call_attempt1 | boolean | YES |  |
| cs_call_attempt2 | boolean | YES |  |
| cs_call_attempt3 | boolean | YES |  |
| cs_call_attempt4 | boolean | YES |  |
| cs_call_attempt5 | boolean | YES |  |
| cs_call_attempt6 | boolean | YES |  |
| cs_call_attempt7 | boolean | YES |  |
| cs_call_attempt8 | boolean | YES |  |
| cs_call_attempt9 | boolean | YES |  |
| cs_call_attempt10 | boolean | YES |  |
| detail | jsonb | YES |  |
| kintone_updated_time | timestamp with time zone | YES |  |
| cs_user_id | uuid | YES |  |
| final_education_detail | text | YES |  |
| job_search_status | text | YES |  |
| desired_work_location | text | YES |  |
| reason_for_change | text | YES |  |
| strengths | text | YES |  |
| job_change_axis | text | YES |  |
| job_change_timing | text | YES |  |
| future_vision | text | YES |  |
| desired_interview_dates | text | YES |  |
| shared_interview_date | text | YES |  |
| carrier_summary_sheet_url | text | YES |  |
| resume_url | text | YES |  |
| next_action_content | text | YES |  |
| cs_name | text | YES |  |
| cs_status | text | YES |  |
| hearing_free_memo | text | YES |  |
| has_chronic_disease | boolean | YES |  |
| chronic_disease_detail | text | YES |  |
| relocation_possible | boolean | YES |  |
| relocation_impossible_reason | text | YES |  |
| personal_concerns | text | YES |  |
| cs_status_notify_sent_at | timestamp with time zone | YES |  |

主キー: id

外部キー:
- candidates_advisor_user_id_fkey: advisor_user_id -> users.id
- candidates_partner_user_id_fkey: partner_user_id -> users.id

インデックス:
- candidates_candidate_code_key: CREATE UNIQUE INDEX candidates_candidate_code_key ON public.candidates USING btree (candidate_code)
- candidates_kintone_record_id_key: CREATE UNIQUE INDEX candidates_kintone_record_id_key ON public.candidates USING btree (kintone_record_id)
- candidates_pkey: CREATE UNIQUE INDEX candidates_pkey ON public.candidates USING btree (id)

---

## clients

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('clients_id_seq'::regclass) |
| name | text | NO |  |
| industry | text | YES |  |
| location | text | YES |  |
| created_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |
| updated_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |
| job_categories | text | YES |  |
| planned_hires_count | integer | YES | 0 |
| salary_range | text | YES |  |
| must_qualifications | text | YES |  |
| nice_qualifications | text | YES |  |
| desired_locations | text | YES |  |
| personality_traits | text | YES |  |
| required_experience | text | YES |  |
| selection_note | text | YES |  |
| warranty_period | integer | YES | 90 |
| contact_name | text | YES |  |
| contact_email | text | YES |  |
| fee_details | text | YES |  |
| contract_note | text | YES |  |
| employees_count | integer | YES |  |
| fee_amount | integer | YES |  |
| salary_min | integer | YES |  |
| salary_max | integer | YES |  |

主キー: id

インデックス:
- clients_pkey: CREATE UNIQUE INDEX clients_pkey ON public.clients USING btree (id)

---

## goal_daily_targets

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('goal_daily_targets_id_seq'::regclass) |
| advisor_user_id | integer | NO |  |
| period_id | text | NO |  |
| target_date | date | NO |  |
| targets | jsonb | NO | '{}'::jsonb |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

主キー: id

インデックス:
- goal_daily_targets_advisor_user_id_period_id_target_date_key: CREATE UNIQUE INDEX goal_daily_targets_advisor_user_id_period_id_target_date_key ON public.goal_daily_targets USING btree (advisor_user_id, period_id, target_date)
- goal_daily_targets_pkey: CREATE UNIQUE INDEX goal_daily_targets_pkey ON public.goal_daily_targets USING btree (id)

---

## goal_settings

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | smallint | NO | 1 |
| evaluation_rule_type | text | NO |  |
| evaluation_rule_options | jsonb | NO | '{}'::jsonb |
| updated_at | timestamp with time zone | NO | now() |

主キー: id

インデックス:
- goal_settings_pkey: CREATE UNIQUE INDEX goal_settings_pkey ON public.goal_settings USING btree (id)

---

## goal_targets

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('goal_targets_id_seq'::regclass) |
| scope | text | NO |  |
| advisor_user_id | integer | YES |  |
| period_id | text | NO |  |
| targets | jsonb | NO | '{}'::jsonb |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

主キー: id

インデックス:
- goal_targets_company_unique: CREATE UNIQUE INDEX goal_targets_company_unique ON public.goal_targets USING btree (scope, period_id) WHERE (scope = 'company'::text)
- goal_targets_personal_unique: CREATE UNIQUE INDEX goal_targets_personal_unique ON public.goal_targets USING btree (advisor_user_id, period_id) WHERE (scope = 'personal'::text)
- goal_targets_pkey: CREATE UNIQUE INDEX goal_targets_pkey ON public.goal_targets USING btree (id)

---

## kintone_sync_cursors

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('kintone_sync_cursors_id_seq'::regclass) |
| system_name | character varying | NO |  |
| last_kintone_record_id_synced | integer | YES |  |
| last_sync_started_at | timestamp with time zone | YES |  |
| last_sync_finished_at | timestamp with time zone | YES |  |
| updated_at | timestamp with time zone | NO | now() |

主キー: id

インデックス:
- kintone_sync_cursors_pkey: CREATE UNIQUE INDEX kintone_sync_cursors_pkey ON public.kintone_sync_cursors USING btree (id)

---

## kintone_sync_runs

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('kintone_sync_runs_id_seq'::regclass) |
| system_name | character varying | NO |  |
| started_at | timestamp with time zone | YES |  |
| finished_at | timestamp with time zone | YES |  |
| inserted_count | integer | YES |  |
| updated_count | integer | YES |  |
| skipped_count | integer | YES |  |
| error_count | integer | YES |  |
| error_summary | text | YES |  |
| created_at | timestamp with time zone | NO | now() |

主キー: id

インデックス:
- kintone_sync_runs_pkey: CREATE UNIQUE INDEX kintone_sync_runs_pkey ON public.kintone_sync_runs USING btree (id)

---

## kpi_targets

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | integer | NO | nextval('kpi_targets_id_seq'::regclass) |
| target_month | character varying(7) | NO |  |
| metric_key | character varying(50) | NO |  |
| target_value | numeric | YES |  |
| created_at | timestamp without time zone | YES | now() |
| updated_at | timestamp without time zone | YES | now() |

主キー: id

インデックス:
- kpi_targets_pkey: CREATE UNIQUE INDEX kpi_targets_pkey ON public.kpi_targets USING btree (id)
- kpi_targets_target_month_metric_key_key: CREATE UNIQUE INDEX kpi_targets_target_month_metric_key_key ON public.kpi_targets USING btree (target_month, metric_key)

---

## meeting_plans

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('meeting_plans_id_seq'::regclass) |
| candidate_id | bigint | NO |  |
| sequence | integer | NO |  |
| planned_date | date | YES |  |
| attendance | boolean | YES | false |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

主キー: id

インデックス:
- idx_meeting_plans_candidate: CREATE INDEX idx_meeting_plans_candidate ON public.meeting_plans USING btree (candidate_id)
- meeting_plans_pkey: CREATE UNIQUE INDEX meeting_plans_pkey ON public.meeting_plans USING btree (id)

---

## member_requests

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('member_requests_id_seq'::regclass) |
| name | text | NO |  |
| email | text | NO |  |
| role | text | NO |  |
| password_hash | text | NO |  |
| is_admin | boolean | YES | false |
| status | text | YES | 'pending'::text |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| approval_token | text | YES |  |
| request_type | text | YES | 'create'::text |
| target_user_id | bigint | YES |  |

主キー: id

インデックス:
- member_requests_pkey: CREATE UNIQUE INDEX member_requests_pkey ON public.member_requests USING btree (id)

---

## ms_daily_targets

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('ms_daily_targets_id_seq'::regclass) |
| scope | text | NO |  |
| department_key | text | NO |  |
| metric_key | text | NO |  |
| advisor_user_id | bigint | YES |  |
| period_id | text | NO |  |
| target_date | date | NO |  |
| target_value | numeric | NO | 0 |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

主キー: id

インデックス:
- ms_daily_targets_period_idx: CREATE INDEX ms_daily_targets_period_idx ON public.ms_daily_targets USING btree (period_id, department_key, metric_key)
- ms_daily_targets_pkey: CREATE UNIQUE INDEX ms_daily_targets_pkey ON public.ms_daily_targets USING btree (id)
- ms_daily_targets_uq: CREATE UNIQUE INDEX ms_daily_targets_uq ON public.ms_daily_targets USING btree (scope, department_key, metric_key, period_id, target_date, COALESCE(advisor_user_id, (0)::bigint))

---

## ms_period_settings

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | integer | NO | nextval('ms_period_settings_id_seq'::regclass) |
| target_month | character varying(7) | NO |  |
| metric_key | character varying(64) | NO |  |
| start_date | date | NO |  |
| end_date | date | NO |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

主キー: id

インデックス:
- ms_period_settings_pkey: CREATE UNIQUE INDEX ms_period_settings_pkey ON public.ms_period_settings USING btree (id)
- ms_period_settings_target_month_metric_key_key: CREATE UNIQUE INDEX ms_period_settings_target_month_metric_key_key ON public.ms_period_settings USING btree (target_month, metric_key)

---

## ms_period_targets

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('ms_period_targets_id_seq'::regclass) |
| scope | text | NO |  |
| department_key | text | NO |  |
| metric_key | text | NO |  |
| advisor_user_id | bigint | YES |  |
| period_id | text | NO |  |
| target_total | numeric | NO | 0 |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

主キー: id

インデックス:
- ms_period_targets_pkey: CREATE UNIQUE INDEX ms_period_targets_pkey ON public.ms_period_targets USING btree (id)
- ms_period_targets_uq: CREATE UNIQUE INDEX ms_period_targets_uq ON public.ms_period_targets USING btree (scope, department_key, metric_key, period_id, COALESCE(advisor_user_id, (0)::bigint))

---

## placements

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('placements_id_seq'::regclass) |
| candidate_application_id | bigint | NO |  |
| fee_amount | integer | YES |  |
| refund_amount | integer | YES |  |
| created_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |
| updated_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |
| order_reported | boolean | YES | false |
| refund_reported | boolean | YES | false |
| order_date | date | YES |  |
| withdraw_date | date | YES |  |

主キー: id

外部キー:
- placements_candidate_application_id_fkey: candidate_application_id -> candidate_applications.id

インデックス:
- placements_candidate_application_id_key: CREATE UNIQUE INDEX placements_candidate_application_id_key ON public.placements USING btree (candidate_application_id)
- placements_pkey: CREATE UNIQUE INDEX placements_pkey ON public.placements USING btree (id)

---

## resume_documents

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('resume_documents_id_seq'::regclass) |
| candidate_id | bigint | NO |  |
| label | text | YES |  |
| document_value | text | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

主キー: id

インデックス:
- idx_resume_docs_candidate: CREATE INDEX idx_resume_docs_candidate ON public.resume_documents USING btree (candidate_id)
- resume_documents_pkey: CREATE UNIQUE INDEX resume_documents_pkey ON public.resume_documents USING btree (id)

---

## screening_rules

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | integer | NO | nextval('screening_rules_id_seq'::regclass) |
| min_age | integer | YES | 18 |
| max_age | integer | YES | 60 |
| allowed_jlpt_levels | text[] | YES | '{N1,N2}'::text[] |
| updated_at | timestamp with time zone | YES | now() |
| target_nationalities | text | YES | '日本'::text |

主キー: id

インデックス:
- screening_rules_pkey: CREATE UNIQUE INDEX screening_rules_pkey ON public.screening_rules USING btree (id)

---

## selection_progress

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('selection_progress_id_seq'::regclass) |
| candidate_id | bigint | NO |  |
| company_name | text | YES |  |
| application_route | text | YES |  |
| recommendation_date | date | YES |  |
| interview_schedule_date | date | YES |  |
| interview_date | date | YES |  |
| offer_date | date | YES |  |
| closing_plan_date | date | YES |  |
| offer_accept_date | date | YES |  |
| joining_date | date | YES |  |
| pre_join_quit_date | date | YES |  |
| introduction_fee | text | YES |  |
| status | text | YES |  |
| note | text | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

主キー: id

インデックス:
- idx_selection_progress_candidate: CREATE INDEX idx_selection_progress_candidate ON public.selection_progress USING btree (candidate_id)
- selection_progress_pkey: CREATE UNIQUE INDEX selection_progress_pkey ON public.selection_progress USING btree (id)

---

## stamp_reads

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('stamp_reads_id_seq'::regclass) |
| stamp_id | bigint | NO |  |
| user_id | integer | YES |  |
| read_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | NO | now() |

主キー: id

インデックス:
- stamp_reads_pkey: CREATE UNIQUE INDEX stamp_reads_pkey ON public.stamp_reads USING btree (id)

---

## stamps

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('stamps_id_seq'::regclass) |
| user_id | integer | YES |  |
| sent_to_user_id | uuid | YES |  |
| read_at | timestamp with time zone | YES |  |
| message | text | YES |  |
| created_at | timestamp with time zone | NO | now() |

主キー: id

インデックス:
- stamps_pkey: CREATE UNIQUE INDEX stamps_pkey ON public.stamps USING btree (id)

---

## sync_state

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| source | text | NO |  |
| last_synced_at | timestamp with time zone | NO | '2000-01-01 00:00:00+00'::timestamp with time zone |

主キー: source

インデックス:
- sync_state_pkey: CREATE UNIQUE INDEX sync_state_pkey ON public.sync_state USING btree (source)

---

## system_options

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| option_key | character varying(100) | NO |  |
| options | jsonb | NO | '{"custom": [], "deleted": []}'::jsonb |
| updated_at | timestamp with time zone | NO | now() |

主キー: option_key

インデックス:
- system_options_pkey: CREATE UNIQUE INDEX system_options_pkey ON public.system_options USING btree (option_key)

---

## teleapo

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('teleapo_logs_id_seq'::regclass) |
| candidate_id | bigint | NO |  |
| call_no | integer | NO |  |
| called_at | timestamp with time zone | NO |  |
| route | text | YES |  |
| result | text | YES |  |
| created_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |
| caller_user_id | bigint | YES |  |
| memo | text | YES |  |

主キー: id

外部キー:
- fk_teleapo_logs_caller_user: caller_user_id -> users.id
- teleapo_logs_candidate_id_fkey: candidate_id -> candidates.id

インデックス:
- idx_teleapo_logs_caller_called_at: CREATE INDEX idx_teleapo_logs_caller_called_at ON public.teleapo USING btree (caller_user_id, called_at DESC)
- idx_teleapo_logs_candidate_called_at: CREATE INDEX idx_teleapo_logs_candidate_called_at ON public.teleapo USING btree (candidate_id, called_at DESC)
- teleapo_logs_pkey: CREATE UNIQUE INDEX teleapo_logs_pkey ON public.teleapo USING btree (id)

---

## user_important_metrics

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('user_important_metrics_id_seq'::regclass) |
| user_id | bigint | NO |  |
| department_key | text | NO |  |
| metric_key | text | NO |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

主キー: id

インデックス:
- user_important_metrics_dept_idx: CREATE INDEX user_important_metrics_dept_idx ON public.user_important_metrics USING btree (department_key)
- user_important_metrics_pkey: CREATE UNIQUE INDEX user_important_metrics_pkey ON public.user_important_metrics USING btree (id)
- user_important_metrics_uq: CREATE UNIQUE INDEX user_important_metrics_uq ON public.user_important_metrics USING btree (user_id, department_key)

---

## user_profiles

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('user_profiles_id_seq'::regclass) |
| user_id | uuid | NO |  |
| department | character varying | YES |  |
| position | character varying | YES |  |
| period_start_date | date | YES |  |
| period_end_date | date | YES |  |
| created_by | bigint | YES |  |
| updated_by | bigint | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

主キー: id

インデックス:
- user_profiles_pkey: CREATE UNIQUE INDEX user_profiles_pkey ON public.user_profiles USING btree (id)

---

## users

| カラム | 型 | NULL許可 | デフォルト |
| --- | --- | --- | --- |
| id | bigint | NO | nextval('users_id_seq'::regclass) |
| name | text | NO |  |
| email | text | NO |  |
| role | text | NO |  |
| created_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |
| updated_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |
| password_hash | text | YES |  |
| is_admin | boolean | NO | false |
| email_verified_at | timestamp with time zone | YES |  |
| image | text | YES |  |

主キー: id

インデックス:
- users_email_key: CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email)
- users_pkey: CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)

---

