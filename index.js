#!/usr/bin/env node

import fetch from "node-fetch";
import cheerio from 'cheerio';
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
/********************************************************************* */
function readUserAgents() {
  try {
    const userAgents = fs.readFileSync('useragent.ini', 'utf8').split('\n');
    return userAgents.filter(ua => ua.trim() !== ''); // Eliminar líneas vacías
  } catch (err) {
    console.error('Error al leer el archivo useragent.ini:', err);
    return []; }}const userAgents = readUserAgents();
function getRandomUserAgent() {
  const randomIndex = Math.floor(Math.random() * userAgents.length);
  return userAgents[randomIndex];
}
/*------------------------------------------------------------------*/
const USERNAME = process.env.USERNAME
const PASSWORD = process.env.PASSWORD
const SCHEDULE_ID = process.env.SCHEDULE_ID
const FACILITY_ID = process.env.FACILITY_ID
const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
const TELEGRAM_GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID;
const BASE_URI = 'https://ais.usvisa-info.com/es-ec/niv'


/******************************************************************************************* */
const bot = new TelegramBot(TELEGRAM_API_KEY);
async function sendTelegramMessage(message) {
  try {
    const fullMessage = `👤 Usuario: ${USERNAME}\n🏢 Facility ID: ${FACILITY_ID}\n\n${message}`; // Mensaje completo con la información relevante
    await bot.sendMessage(TELEGRAM_GROUP_CHAT_ID, fullMessage); // Envía el mensaje al grupo en lugar de a un usuario específico
    console.log('Mensaje enviado a Telegram con éxito.');
} catch (error) {
    console.error('Error al enviar mensaje a Telegram:', error.message);}}
/******************************************************************************************* */
async function main(currentBookedDate, maxDate, errorCount = 0) {
  if (!currentBookedDate) {
    log(`Fecha de reserva actual no válida: ${currentBookedDate}`);
    process.exit(1);
  }

  log(`\n─────────────────────────────────────────\n   💻 Inicialización completa 💻\n─────────────────────────────────────────\n📅 Fecha actual: ${currentBookedDate}\n👤 Usuario: ${USERNAME}\n🏢 Facility ID: ${FACILITY_ID}\n─────────────────────────────────────────`);
  
  let lastErrorTime = null;
  var softBlock = false;

  try {
    const sessionHeaders = await login();

    while (true) {
      const date = await checkAvailableDate(sessionHeaders, maxDate);

      if (!date) {
        log("⛔️ Sin fechas disponibles actualmente.");
        softBlock = true;
      } else if (date > currentBookedDate) {
        log(`⏩ Fecha actual: ${currentBookedDate} Fecha disponible: ${date}`);
        softBlock = false;
        const message = `⏩ Fecha actual: ${currentBookedDate} Fecha disponible: ${date}`;
        await sendHourlyTelegramNotification(message);
      } else {
        if (date > maxDate) {
          log("Reajustando la fecha de reserva...");

          const currentDate = new Date(currentBookedDate);
          const maxDateObj = new Date(maxDate);
          const difference = maxDateObj.getTime() - currentDate.getTime();
          const differenceInDays = Math.ceil(difference / (1000 * 60 * 60 * 24));
          currentBookedDate = new Date(currentDate.getTime() + differenceInDays * (1000 * 60 * 60 * 24)).toISOString().slice(0, 10);
          log(`Fecha de reserva reajustada: ${currentBookedDate}`);
        }

        currentBookedDate = date;
        const time = await checkAvailableTime(sessionHeaders, date);

        await book(sessionHeaders, date, time)
          .then(d => {
            log(`✨ Cita reservada para ${date} a las ${time} - ¡Éxito! 🎉`);
            sendTelegramMessage(`✨ ¡Cita reservada para ${date} a las ${time} - Éxito! 🎉`);
            setTimeout(() => {
              log('Han pasado 2 horas. Verificando nuevamente las citas disponibles.');
            }, 7200); 
          });
        await sleep(12000);
        softBlock = false;
      }

      if (softBlock) {
        const currentDate = new Date();
        await sleep((30 - (currentDate.getMinutes() % 30)) * 60);
      } else {
        await randomSleep(1, 17);
      }
    }
  } catch (err) {
    if (err.code === 'ECONNRESET') {
      console.error('\x1b[31m%s\x1b[0m', `Error: La conexión al servidor (${BASE_URI}) se restableció de manera inesperada. (SOCKET HANG UP)`);
    } else {
      console.error('Ocurrió una excepción:', err.message);
    }
  
    if (isTransientError(err)) {
      errorCount += 1;
      lastErrorTime = Date.now();
     
      if (errorCount >= 4) {
        const minTime = 850;
        const maxTime = 1875;
        const randomTime = Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
        const minutesToWait = Math.round(randomTime / 60); 
        log(`Se han producido más de 4 errores consecutivos. Esperando aproximadamente \x1b[33m${minutesToWait}\x1b[0m minutos antes de continuar...`);        await sleep(randomTime);
        log("Cerrando el terminal...");
        process.exit(1);
      } else {
        const minTime = 30;
        const maxTime = 77;
        const randomTime = Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
        log(`Esperando \x1b[33m${randomTime}\x1b[0m segundos antes de intentarlo de nuevo...`);        await sleep(randomTime);
        await main(currentBookedDate, maxDate, errorCount);
      }
    } else {
      log("Error no transitorio detectado, deteniendo el proceso.");
      process.exit(1);
    }
  }
}


/******************************************************************************************* */
let lastTelegramNotificationTime = 0;
async function sendHourlyTelegramNotification(message) {
  const currentTime = Date.now();
  if (currentTime - lastTelegramNotificationTime >= 1800000) { 
    await sendTelegramMessage(message); 
    lastTelegramNotificationTime = currentTime;
  } else if (lastTelegramNotificationTime === 0) {
    await sendTelegramMessage("Inicio del proceso.");
    lastTelegramNotificationTime = currentTime;
  }
}

/******************************************************************************************* */
function isTransientError(error) {
  const transientErrorCodes = [401, 402, 403,404, 500, 502, 504];
  const transientNetworkErrors = ["ENOTFOUND", "ETIMEDOUT", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH", "ENETDOWN", "ENETRESET", "ECONNRESET"];
  return transientErrorCodes.includes(error.status) || transientNetworkErrors.includes(error.code) || error.message === "socket hang up";
}
async function handleErrors(response) {
  try {
    const errorMessage = response['error'];
    if (errorMessage) {
      throw new Error(errorMessage);
    }
    return response;
  } catch (error) {
    console.error("Error:", error.message);
    if (isTransientError(error)) {
      console.log("Se produjo un error transitorio. Por favor, inténtalo de nuevo más tarde.");
    } else {
      console.log("Se produjo un error. Por favor, contacta al soporte técnico.");
    }
    throw error;
  }
}

/******************************************************************************************* */
async function login() {
  const userAgent = getRandomUserAgent();
  console.log('\nUser-Agent seleccionado:\n', userAgent);

  const anonymousHeaders = await fetch(`${BASE_URI}/users/sign_in`, {
    headers: {
      "User-Agent": userAgent,
      "Accept": "*/*",
      "Accept-Encoding": "gzip, deflate, br",
      "Connection": "keep-alive",
      "Referer": BASE_URI,
      "Content-Type": "text/plain",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      'Cache-Control': 'no-store',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
    }
  }).then(response => extractHeaders(response));
  
  return fetch(`${BASE_URI}/users/sign_in`, {
    method: "POST",
    headers: Object.assign({}, anonymousHeaders, {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    }),
    body: new URLSearchParams({
      'utf8': '✓',
      'user[email]': USERNAME,
      'user[password]': PASSWORD,
      'policy_confirmed': '1',
      'commit': 'Submit' 
    }),
  })
  .then(res => (
    Object.assign({}, anonymousHeaders, {
      'Cookie': extractRelevantCookies(res)
    })
  ));
}

/******************************************************************************************* */
function fetchData(url, headers) {
  headers = Object.assign({}, headers, {
    'Accept': 'application/json',
    "X-Requested-With": "XMLHttpRequest",
    'Connection': 'keep-alive',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Upgrade-Insecure-Requests': '1',

  });

  return fetch(url, {
    headers: headers,
    credentials: 'same-origin', 
    agent: null,
   ///mode: 'navigate',
    keepalive: true,
  })
  .then(r => {
    if (!r.ok) {
      throw { status: response.status, message: `Error ${response.status}` };
    }
    return r.json();
  })
  .then(r => handleErrors(r));
}
/******************************************************************************************* */

function checkAvailableDate(headers) {
  const url = `${BASE_URI}/schedule/${SCHEDULE_ID}/appointment/days/${FACILITY_ID}.json?appointments[expedite]=false`;
  return fetchData(url, headers)
  .then(d => d && d.length > 0 ? d[0]['date'] : null);
}

function checkAvailableTime(headers, date) {
  const url = `${BASE_URI}/schedule/${SCHEDULE_ID}/appointment/times/${FACILITY_ID}.json?date=${date}&appointments[expedite]=false`;
  return fetchData(url, headers)
    .then(d => d['business_times'][0] || d['available_times'][0]);
}

/****************************************************************************************** */

/*async function book(headers, date, time) {
  const url = `${BASE_URI}/schedule/${SCHEDULE_ID}/appointment`

  const newHeaders = await fetch(url, { "headers": headers })
    .then(response => extractHeaders(response))

  return fetch(url, {
    "method": "POST",
    "redirect": "follow",
    "headers": Object.assign({}, newHeaders, {
      'Content-Type': 'application/x-www-form-urlencoded',
    }),
    "body": new URLSearchParams({
      'utf8': '✓',
      'authenticity_token': newHeaders['X-CSRF-Token'],
      'confirmed_limit_message': '1',
      'use_consulate_appointment_capacity': 'true',
      'appointments[consulate_appointment][facility_id]': FACILITY_ID,
      'appointments[consulate_appointment][date]': date,
      'appointments[consulate_appointment][time]': time,
      'appointments[asc_appointment][facility_id]': '',
      'appointments[asc_appointment][date]': '',
      'appointments[asc_appointment][time]': ''
    }),
  })
}*/

async function book(headers, date, time) {
  const url = `${BASE_URI}/schedule/${SCHEDULE_ID}/appointment`;

  try {
    const newHeadersResponse = await fetch(url, { headers });
    const newHeaders = await extractHeaders(newHeadersResponse);

    const bodyParams = new URLSearchParams({
      'utf8': '✓',
      'authenticity_token': newHeaders['X-CSRF-Token'],
      'confirmed_limit_message': '1',
      'use_consulate_appointment_capacity': 'true',
      'appointments[consulate_appointment][facility_id]': FACILITY_ID,
      'appointments[consulate_appointment][date]': date,
      'appointments[consulate_appointment][time]': time,
      'appointments[asc_appointment][facility_id]': '',
      'appointments[asc_appointment][date]': '',
      'appointments[asc_appointment][time]': ''
    });

    const response = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: Object.assign({}, newHeaders, {
        'Content-Type': 'application/x-www-form-urlencoded',
      }),
      body: bodyParams,
    });

    if (!response.ok) {
      throw new Error(`La solicitud falló con estado ${response.status}`);
    }
    return response;
  } catch (error) {
    console.error('Ocurrió un error al reservar la cita:', error.message);
    throw error;
  }
}

/****************************************************************************************** */


async function extractHeaders(res) {
  const cookies = await extractRelevantCookies(res);
  const html = await res.text();
  const $ = cheerio.load(html);
  const csrfToken = $('meta[name="csrf-token"]').attr('content');


  return {
    "Cookie": cookies,
    "X-CSRF-Token": csrfToken,
    "Referer": BASE_URI,
    "Referrer-Policy": "strict-origin-when-cross-origin",
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Cache-Control': 'no-store',
    'Connection': 'keep-alive'
  }
}

/****************************************************************************************** */

/*function extractRelevantCookies(res) {
  const setCookieHeader = res.headers.get('set-cookie');
  if (!setCookieHeader) {
    return '';
  }
  const parsedCookies = parseCookies(setCookieHeader);
  return `_yatri_session=${parsedCookies['_yatri_session']}`;
} */


function extractRelevantCookies(res) {
  const setCookieHeader = res.headers.get('set-cookie');
  if (!setCookieHeader) {
    return '';
  }
  
  const parsedCookies = parseCookies(setCookieHeader);
  const relevantCookies = [];
  Object.keys(parsedCookies).forEach(cookieName => {
    relevantCookies.push(`${cookieName}=${parsedCookies[cookieName]}`);
  });
  return relevantCookies.join('; ');
}

function parseCookies(cookies) {
  const parsedCookies = {}
  cookies.split(';').map(c => c.trim()).forEach(c => {
    const [name, value] = c.split('=', 2)
    parsedCookies[name] = value
  }) 
  return parsedCookies
}

/****************************************************************************************** */

const randomSleep = (minSeconds, maxSeconds) => {
  const randomDelay = Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
  return new Promise(resolve => setTimeout(resolve, randomDelay * 1000)); // Convertir segundos a milisegundos
};


function sleep(s) {
  return new Promise((resolve) => {
    setTimeout(resolve, s * 1000);
  });
}
/****************************************************************************************** */
function log(message) {
  const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/Guayaquil' }).replace('T', ' ').replace('Z', '');
  console.log(`[${formattedDateTime}]`, message);
}



/****************************************************************************************** */

const args = process.argv.slice(2);
const currentBookedDate = args[0]; // Establece una fecha predeterminada si no se proporciona ninguna fecha
const maxDate = args[1] || '2024-05-16'; // Establece una fecha predeterminada si no se proporciona ninguna fecha máxima
main(currentBookedDate, maxDate);
