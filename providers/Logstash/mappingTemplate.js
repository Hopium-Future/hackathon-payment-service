module.exports = {
    mappings: {
        properties:
            {
                "@timestamp": { type: "date" },
                "@version": { type: "keyword" },
                message: { type: "text", index: true },
                severity: { type: "keyword", index: true },
                fields:
                    {
                        properties:
                            {
                                fee:
                                    { type: "float" },
                                fee_currency:
                                    { type: "long" },
                                fee_metadata:
                                    {
                                        properties:
                                            {
                                                close_order:
                                                    {
                                                        properties:
                                                            {
                                                                currency:
                                                                    { type: "long" },
                                                                value:
                                                                    { type: "float" }
                                                            }
                                                    },
                                                place_order:
                                                    {
                                                        properties:
                                                            {
                                                                currency:
                                                                    { type: "long" },
                                                                pendingBonus:
                                                                    { type: "long" },
                                                                value:
                                                                    { type: "float" }
                                                            }
                                                    },
                                                promote_program:
                                                    {
                                                        properties:
                                                            {
                                                                order_count:
                                                                    { type: "long" }
                                                            }
                                                    }
                                            }
                                    },
                                fee_value:
                                    { type: "float" },
                                from_currency:
                                    { type: "long" },
                                from_value:
                                    { type: "float" },
                                is_copy_trade_master:
                                    { type: "boolean" },
                                last_retry_time:
                                    { type: "date" },
                                leverage:
                                    { type: "float" },
                                log_type:
                                    { type: "text" },
                                margin:
                                    { type: "float" },
                                margin_currency:
                                    { type: "long" },
                                mode:
                                    { type: "long" },
                                nami_profit:
                                    { type: "float" },
                                nami_profit_currency:
                                    { type: "long" },
                                notification_metadata:
                                    {
                                        properties:
                                            {
                                                last_tick_notification:
                                                    { type: "long" },
                                                notified_at:
                                                    { type: "date" }
                                            }
                                    },
                                open_limit_price:
                                    { type: "float" },
                                open_mode:
                                    { type: "long" },
                                open_price:
                                    { type: "float" },
                                opened_at:
                                    { type: "date" },
                                price:
                                    { type: "float" },
                                profit:
                                    { type: "float" },
                                promote_program:
                                    { type: "long" },
                                quantity:
                                    { type: "float" },
                                reason_close:
                                    { type: "text" },
                                bitmex_sl_order_id:
                                    { type: "text" },
                                bitmex_tp_order_id:
                                    { type: "text" },
                                bitmex_main_order_id:
                                    { type: "text" },
                                reason_close_code:
                                    { type: "long" },
                                remain_amount:
                                    { type: "float" },
                                retry_modify_limit_count:
                                    { type: "long" },
                                retry_transfer_count:
                                    { type: "long" },
                                side:
                                    { type: "text" },
                                sl:
                                    { type: "float" },
                                status:
                                    { type: "long" },
                                swap:
                                    { type: "float" },
                                symbol:
                                    { type: "text" },
                                timestamp:
                                    { type: "date" },
                                to_currency:
                                    { type: "long" },
                                to_value:
                                    { type: "float" },
                                token_index:
                                    { type: "long" },
                                token_name:
                                    { type: "text" },
                                tp:
                                    { type: "float" },
                                transfer_error:
                                    { type: "long" },
                                type:
                                    { type: "text" },
                                updated_at:
                                    { type: "date" },
                                userId:
                                    { type: "long" },
                                value:
                                    { type: "float" },
                                withdraw_fee:
                                    { type: "float" },
                                withdraw_fee_currency:
                                    { type: "long" }
                            }
                    },
                service:
                    { type: "text" }
            }
    }
}
