const { useMultiFileAuthState, default: makeWASocket, DisconnectReason } = require("baileys")
const QRCode = require("qrcode");

const userState = {} // estado por usuario

async function connectToWhatsApp () {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')

    const sock = makeWASocket({
        auth: state,
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update
        if(connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('Puede conectarse a whatsapp ', lastDisconnect.error, ', reconectando ', shouldReconnect)
            if(shouldReconnect) {
                connectToWhatsApp()
            }
        } else if(connection === 'open') {
            console.log('✅ Conexion Abierta!!')
        }

        if (qr) {
            console.log(await QRCode.toString(qr, {type:'terminal', small: true}))
        }
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messages.upsert', async event => {
        for (const m of event.messages) {
            if (!m.message || m.key.fromMe || m.key.remoteJid.includes('@g.us') || m.key.remoteJid.includes('@broadcast')) {
                return;
            }

            const id = m.key.remoteJid;
            const text = m.message.conversation || m.message.extendedTextMessage?.text?.trim();

            if (!userState[id]) {
                userState[id] = { currentMenu: 'main' }
                console.log('replying to', id)
                await sock.sendMessage(id, { text: 'Hola Mundo' })
                await enviarMenu(sock, id, 'main')
                return;
            }

            const currentMenuKey = userState[id].currentMenu
            const currentMenu = menuData[currentMenuKey]
            const selectedOption = currentMenu.options[text]

            if (selectedOption) {
                if (selectedOption.respuesta) {
                    if (selectedOption.respuesta.tipo === 'text') {
                        await sock.sendMessage(id, { text: selectedOption.respuesta.msg })
                    } else if (selectedOption.respuesta.tipo === 'image') {
                        await sock.sendMessage(id, {
                            image: { url: selectedOption.respuesta.msg.url },
                            caption: selectedOption.text
                        })
                    }
                }

                if (selectedOption.submenu) {
                    userState[id].currentMenu = selectedOption.submenu
                    await enviarMenu(sock, id, selectedOption.submenu)
                }
            } else {
                await sock.sendMessage(id, { text: "Opción no válida. Intenta nuevamente." })
                await enviarMenu(sock, id, currentMenuKey)
            }
        }
    })
}
connectToWhatsApp()

async function enviarMenu(sock, id, menukey){
    const menu = menuData[menukey];
    const optionText = Object.entries(menu.options).map(([key, option])=> `-> ${key}: ${option.text}`).join("\n");
    const MenuMensaje = `${menu.mensaje}\n${optionText}\n\n>indicanos una opcion`

    await sock.sendMessage(id, {text: MenuMensaje})
}

// MENU REESTRUCTURADO PARA FUNCIONAR
const menuData = {
    main: {
        mensaje: "Hola bienvenido elije",
        options: {
            A: {
                text: "Metodos de pago",
                respuesta: {
                    tipo: "text",
                    msg: "los metodos de pago son..."
                }
            },
            B: {
                text: "ver catalogo",
                respuesta: {
                    tipo: "image",
                    msg: {
                        url: "https://images.pexels.com/photos/177809/pexels-photo-177809.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500"
                    }
                }
            },
            C: {
                text: "Nuestros Servicios",
                submenu: "servicios"
            }
        }
    },
    servicios: {
        mensaje: "Nuestros servicios son:",
        options: {
            1: {
                text: "desarrollo de software",
                respuesta: {
                    tipo: "text",
                    msg: "desarrollamos software..."
                }
            },
            2: {
                text: "consultoría tecnológica",
                respuesta: {
                    tipo: "text",
                    msg: "ofrecemos consultoría en tecnología..."
                }
            }
        }
    }
}
