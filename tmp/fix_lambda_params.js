const fs = require('fs');
let content = fs.readFileSync('tmp/lambda/prod-candidates-detail/index.mjs', 'utf8');

const regexUpdate = /UPDATE candidate_applications SET[\s\S]*?WHERE id = \$1 AND candidate_id = \$32/;
const newUpdate = `UPDATE candidate_applications SET 
	                                        client_id = $2,
	                                        stage_current = $3,
	                                        job_title = $4,
	                                        apply_route = $5,
	                                        proposal_date = COALESCE($6, proposal_date),
	                                        recommended_at = COALESCE($7, recommended_at),
	                                        first_interview_set_at = COALESCE($8, first_interview_set_at),
	                                        first_interview_at = COALESCE($9, first_interview_at),
	                                        second_interview_set_at = COALESCE($10, second_interview_set_at),
	                                        second_interview_at = COALESCE($11, second_interview_at),
	                                        final_interview_set_at = COALESCE($12, final_interview_set_at),
	                                        final_interview_at = COALESCE($13, final_interview_at),
	                                        offer_date = COALESCE($14, offer_date),
	                                        offer_at = COALESCE($15, offer_at),
	                                        offer_accept_date = COALESCE($16, offer_accept_date),
	                                        offer_accepted_at = COALESCE($17, offer_accepted_at),
	                                        join_date = COALESCE($18, join_date),
	                                        joined_at = COALESCE($19, joined_at),
	                                        pre_join_withdraw_date = COALESCE($20, pre_join_withdraw_date),
	                                        pre_join_withdraw_reason = COALESCE($21, pre_join_withdraw_reason),
	                                        post_join_quit_date = COALESCE($22, post_join_quit_date),
	                                        post_join_quit_reason = COALESCE($23, post_join_quit_reason),
	                                        declined_after_offer_at = COALESCE($24, declined_after_offer_at),
	                                        declined_after_offer_reason = COALESCE($25, declined_after_offer_reason),
	                                        early_turnover_at = COALESCE($26, early_turnover_at),
	                                        early_turnover_reason = COALESCE($27, early_turnover_reason),
	                                        close_expected_at = COALESCE($28, close_expected_at),
	                                        closing_forecast_at = COALESCE($29, closing_forecast_at),
	                                        selection_note = COALESCE($30, selection_note),
	                                        fee = COALESCE($31, fee),
	                                        updated_at = NOW() 
	                                    WHERE id = $1 AND candidate_id = $32`;

content = content.replace(regexUpdate, newUpdate);

const regexUpdateArray = /s_fee,\r?\n\s*candidateId,\r?\n\s*\]\r?\n\s*\);\r?\n\s*\} else if \(s_clientId\)/;
const targetUpdateArray = `s_fee,\r?\n                                        candidateId,\r?\n                                    ]`;
// The matched content had duplicated parameters:
/*
                                        s_offerDate,
                                        s_offerDate,
                                        s_offerAcceptDate,
                                        s_offerAcceptDate,
                                        s_joinDate,
                                        s_joinDate,
...
                                        s_closeExpectedAt,
                                        s_closeExpectedAt,
*/
const regexParams1 = /\[\s*s_id,\s*s_clientId,\s*s_stage,[\s\S]*?candidateId,\s*\]\s*\);\s*\}\s*else if \(s_clientId\)/;

const newParams1 = `[
                                        s_id,
                                        s_clientId,
                                        s_stage,
                                        s_jobTitle,
                                        s_route,
                                        s_proposalDate,
                                        s_recommendedAt,
                                        s_firstInterviewSetAt,
                                        s_firstInterviewAt,
                                        s_secondInterviewSetAt,
                                        s_secondInterviewAt,
                                        s_finalInterviewSetAt,
                                        s_finalInterviewAt,
                                        s_offerDate,
                                        s_offerDate,
                                        s_offerAcceptDate,
                                        s_offerAcceptDate,
                                        s_joinDate,
                                        s_joinDate,
                                        s_preJoinWithdrawDate,
                                        s_preJoinWithdrawReason,
                                        s_postJoinQuitDate,
                                        s_postJoinQuitReason,
                                        s_declinedAfterOfferAt,
                                        s_declinedAfterOfferReason,
                                        s_earlyTurnoverAt,
                                        s_earlyTurnoverReason,
                                        s_closeExpectedAt,
                                        s_closeExpectedAt,
                                        s_selectionNote,
                                        s_fee,
                                        candidateId,
                                    ]
                                );
                            } else if (s_clientId)`;

content = content.replace(regexParams1, newParams1);


const regexParams2 = /\[\s*candidateId,\s*s_clientId,\s*s_stage,[\s\S]*?s_fee,\s*\]\s*\);\s*\}\s*\}\s*\}/;

const newParams2 = `[
                                        candidateId,
                                        s_clientId,
                                        s_stage,
                                        s_jobTitle,
                                        s_route,
                                        s_proposalDate,
                                        s_recommendedAt,
                                        s_firstInterviewSetAt,
                                        s_firstInterviewAt,
                                        s_secondInterviewSetAt,
                                        s_secondInterviewAt,
                                        s_finalInterviewSetAt,
                                        s_finalInterviewAt,
                                        s_offerDate,
                                        s_offerDate,
                                        s_offerAcceptDate,
                                        s_offerAcceptDate,
                                        s_joinDate,
                                        s_joinDate,
                                        s_preJoinWithdrawDate,
                                        s_preJoinWithdrawReason,
                                        s_postJoinQuitDate,
                                        s_postJoinQuitReason,
                                        s_declinedAfterOfferAt,
                                        s_declinedAfterOfferReason,
                                        s_earlyTurnoverAt,
                                        s_earlyTurnoverReason,
                                        s_closeExpectedAt,
                                        s_closeExpectedAt,
                                        s_selectionNote,
                                        s_fee,
                                    ]
                                );
                            }
                        }
                    }`;

content = content.replace(regexParams2, newParams2);

fs.writeFileSync('tmp/lambda/prod-candidates-detail/index.mjs', content, 'utf8');
console.log("Updated lambda script successfully.");
