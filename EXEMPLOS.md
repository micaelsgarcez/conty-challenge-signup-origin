# Exemplos de request e response

Execução real com `npm start` em 2026-10-11, banco novo com o seed, nesta ordem. O `click_id` e os horários mudam a cada execução. O relógio é o real, então um toque fora da janela não aparece aqui (só 7 dias depois); esse caso está nos testes, com relógio injetado.

## Link de campanha

```
curl -s -i "http://127.0.0.1:3006/r?kind=campaign&campaign_id=cmp_verao"
```

Resposta:

```
HTTP 302
location: https://app.conty.com.br/abrir?kind=campaign&campaign_id=cmp_verao&click_id=clk_d5ad964b-3900-414d-9226-f09ed87bef15
```

## Link de indicação

```
curl -s -i "http://127.0.0.1:3006/r?kind=referral&referral_code=ANA10"
```

Resposta:

```
HTTP 302
location: https://app.conty.com.br/abrir?kind=referral&referral_code=ANA10&click_id=clk_d5f3e128-4df9-4d23-be92-f57315a93363
```

## Link de campanha inexistente

```
curl -s 'http://127.0.0.1:3006/r?kind=campaign&campaign_id=cmp_nao_existe'
```

Resposta:

```
{"error":"Campanha ou código de indicação não encontrado.","code":"link_target_not_found"}
HTTP 404
```

## Primeira abertura do app

```
curl -s -X POST http://127.0.0.1:3006/installs -H 'content-type: application/json' -d '{"device_id":"dev_ana"}'
```

Resposta:

```
{"device_id":"dev_ana","first_opened_at":"2026-10-11T08:20:43.202Z"}
HTTP 201
```

## Abrir o app de novo (não muda first_opened_at)

```
curl -s -X POST http://127.0.0.1:3006/installs -H 'content-type: application/json' -d '{"device_id":"dev_ana"}'
```

Resposta:

```
{"device_id":"dev_ana","first_opened_at":"2026-10-11T08:20:43.202Z"}
HTTP 200
```

## Toque da campanha

```
curl -s -X POST http://127.0.0.1:3006/touches -H 'content-type: application/json' -d '{"device_id":"dev_ana","click_id":"clk_d5ad964b-3900-414d-9226-f09ed87bef15","kind":"campaign","campaign_id":"cmp_verao"}'
```

Resposta:

```
{"device_id":"dev_ana","click_id":"clk_d5ad964b-3900-414d-9226-f09ed87bef15","kind":"campaign","ref":"cmp_verao","touched_at":"2026-10-11T08:20:43.216Z"}
HTTP 201
```

## Mesmo clique de novo (não cria segunda origem)

```
curl -s -X POST http://127.0.0.1:3006/touches -H 'content-type: application/json' -d '{"device_id":"dev_ana","click_id":"clk_d5ad964b-3900-414d-9226-f09ed87bef15","kind":"campaign","campaign_id":"cmp_verao"}'
```

Resposta:

```
{"device_id":"dev_ana","click_id":"clk_d5ad964b-3900-414d-9226-f09ed87bef15","kind":"campaign","ref":"cmp_verao","touched_at":"2026-10-11T08:20:43.216Z"}
HTTP 200
```

## Toque da indicação, depois da campanha

```
curl -s -X POST http://127.0.0.1:3006/touches -H 'content-type: application/json' -d '{"device_id":"dev_ana","click_id":"clk_d5f3e128-4df9-4d23-be92-f57315a93363","kind":"referral","referral_code":"ANA10"}'
```

Resposta:

```
{"device_id":"dev_ana","click_id":"clk_d5f3e128-4df9-4d23-be92-f57315a93363","kind":"referral","ref":"ANA10","touched_at":"2026-10-11T08:20:43.230Z"}
HTTP 201
```

## Toque de dispositivo sem primeira abertura

```
curl -s -X POST http://127.0.0.1:3006/touches -H 'content-type: application/json' -d '{"device_id":"dev_fantasma","click_id":"clk_x","kind":"campaign","campaign_id":"cmp_verao"}'
```

Resposta:

```
{"error":"O dispositivo ainda não registrou a primeira abertura do app.","code":"install_not_found"}
HTTP 404
```

## Toque com kind inválido

```
curl -s -X POST http://127.0.0.1:3006/touches -H 'content-type: application/json' -d '{"device_id":"dev_ana","click_id":"clk_y","kind":"banner"}'
```

Resposta:

```
{"error":"O kind deve ser campaign ou referral.","code":"kind_invalid"}
HTTP 422
```

## Cadastro com dois toques

```
curl -s -X POST http://127.0.0.1:3006/signups -H 'content-type: application/json' -d '{"user_id":"usr_ana","device_id":"dev_ana"}'
```

Resposta:

```
{"user_id":"usr_ana","device_id":"dev_ana","signed_up_at":"2026-10-11T08:20:43.251Z","origin":"referral","origin_reason":"last_valid_touch","winning_click_id":"clk_d5f3e128-4df9-4d23-be92-f57315a93363","touches":[{"click_id":"clk_d5ad964b-3900-414d-9226-f09ed87bef15","kind":"campaign","ref":"cmp_verao","touched_at":"2026-10-11T08:20:43.216Z","outcome":"lost","reason":"Perdeu para clk_d5f3e128-4df9-4d23-be92-f57315a93363: toque mais recente vence."},{"click_id":"clk_d5f3e128-4df9-4d23-be92-f57315a93363","kind":"referral","ref":"ANA10","touched_at":"2026-10-11T08:20:43.230Z","outcome":"won","reason":"Toque válido mais recente."}],"first_opened_at":"2026-10-11T08:20:43.202Z","window_ms":604800000,"window_ends_at":"2026-10-18T08:20:43.202Z","rule":"O toque válido mais recente vence. Empate de horário: indicação vence campanha; mesmo tipo, menor click_id vence."}
HTTP 201
```

## Link aberto depois do cadastro (aceito, mas não conta)

```
curl -s -X POST http://127.0.0.1:3006/touches -H 'content-type: application/json' -d '{"device_id":"dev_ana","click_id":"clk_depois","kind":"campaign","campaign_id":"cmp_creators_br"}'
```

Resposta:

```
{"device_id":"dev_ana","click_id":"clk_depois","kind":"campaign","ref":"cmp_creators_br","touched_at":"2026-10-11T08:20:43.257Z"}
HTTP 201
```

## Auditar o cadastro (decisão gravada)

```
curl -s http://127.0.0.1:3006/signups/usr_ana
```

Resposta:

```
{"user_id":"usr_ana","device_id":"dev_ana","signed_up_at":"2026-10-11T08:20:43.251Z","origin":"referral","origin_reason":"last_valid_touch","winning_click_id":"clk_d5f3e128-4df9-4d23-be92-f57315a93363","touches":[{"click_id":"clk_d5ad964b-3900-414d-9226-f09ed87bef15","kind":"campaign","ref":"cmp_verao","touched_at":"2026-10-11T08:20:43.216Z","outcome":"lost","reason":"Perdeu para clk_d5f3e128-4df9-4d23-be92-f57315a93363: toque mais recente vence."},{"click_id":"clk_d5f3e128-4df9-4d23-be92-f57315a93363","kind":"referral","ref":"ANA10","touched_at":"2026-10-11T08:20:43.230Z","outcome":"won","reason":"Toque válido mais recente."}],"first_opened_at":"2026-10-11T08:20:43.202Z","window_ms":604800000,"window_ends_at":"2026-10-18T08:20:43.202Z","rule":"O toque válido mais recente vence. Empate de horário: indicação vence campanha; mesmo tipo, menor click_id vence."}
HTTP 200
```

## Primeira abertura sem clicar em link

```
curl -s -X POST http://127.0.0.1:3006/installs -H 'content-type: application/json' -d '{"device_id":"dev_caio"}'
```

Resposta:

```
{"device_id":"dev_caio","first_opened_at":"2026-10-11T08:20:43.271Z"}
HTTP 201
```

## Cadastro orgânico, sem toque

```
curl -s -X POST http://127.0.0.1:3006/signups -H 'content-type: application/json' -d '{"user_id":"usr_caio","device_id":"dev_caio"}'
```

Resposta:

```
{"user_id":"usr_caio","device_id":"dev_caio","signed_up_at":"2026-10-11T08:20:43.279Z","origin":"organic","origin_reason":"no_touch","winning_click_id":null,"touches":[],"first_opened_at":"2026-10-11T08:20:43.271Z","window_ms":604800000,"window_ends_at":"2026-10-18T08:20:43.271Z","rule":"O toque válido mais recente vence. Empate de horário: indicação vence campanha; mesmo tipo, menor click_id vence."}
HTTP 201
```

## Cadastro orgânico, sem primeira abertura registrada

```
curl -s -X POST http://127.0.0.1:3006/signups -H 'content-type: application/json' -d '{"user_id":"usr_bia","device_id":"dev_bia"}'
```

Resposta:

```
{"user_id":"usr_bia","device_id":"dev_bia","signed_up_at":"2026-10-11T08:20:43.285Z","origin":"organic","origin_reason":"no_install","winning_click_id":null,"touches":[],"first_opened_at":null,"window_ms":604800000,"window_ends_at":null,"rule":"O toque válido mais recente vence. Empate de horário: indicação vence campanha; mesmo tipo, menor click_id vence."}
HTTP 201
```

## Cadastro inexistente

```
curl -s http://127.0.0.1:3006/signups/usr_nao_existe
```

Resposta:

```
{"error":"Cadastro não encontrado.","code":"signup_not_found"}
HTTP 404
```

