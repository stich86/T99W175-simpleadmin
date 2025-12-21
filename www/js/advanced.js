function simpleSettings() {
return {
    isLoading: false,
    showSuccess: false,
    showError: false,
    isClean: true,
    showModal: false,
    isRebooting: false,
    atcmd: "",
    fetchATCommand: "",
    countdown: 0,
    atCommandResponse: "",
    currentSettingsResponse: "",
    errorMessage: "",
    ttldata: null,
    ttlvalue: 0,
    ttlStatus: false,
    newTTL: null,
    ipPassMode: "Unspecified",
    ipPassStatus: false,
    usbNetMode: "Unspecified",
    currentUsbNetMode: "Unknown",
    DNSProxyStatus: true,

    closeModal() {
    this.confirmModal = false;
    this.showModal = false;
    },

    showRebootModal() {
    this.showModal = true;
    },

    handleAtError(message, data = "") {
    this.errorMessage = message;
    this.showError = true;
    if (data) {
        this.atCommandResponse = data;
    }
    this.isLoading = false;
    console.error("AT command error:", message);
    },

    async sendATCommand() {
    if (!this.atcmd) {
        // Use ATI as default command
        this.atcmd = "ATI";
        console.log(
        "AT Command is empty, using ATI as default command: ",
        this.atcmd
        );
    }
    this.isLoading = true;

    try {
        const result = await ATCommandService.execute(this.atcmd, {
        retries: 3,
        timeout: 12000,
        });

        if (!result.ok) {
        const message = result.error
            ? result.error.message
            : "Unknown error while executing the command.";
        this.handleAtError(message, result.data);
        return;
        }

        this.atCommandResponse = result.data;
        this.showError = false;
        this.isClean = false;
    } catch (error) {
        this.handleAtError(
        error.message || "Network error while executing the command."
        );
    } finally {
        this.isLoading = false;
    }
    },

    async sendUserATCommand() {
    this.isLoading = true;
    const encodedATCmd = encodeURIComponent(this.atcmd);
    const url = `/cgi-bin/user_atcommand?atcmd=${encodedATCmd}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.text();
        this.atCommandResponse = data;
        this.showError = false;
        this.isClean = false;
    } catch (error) {
        this.handleAtError(
        error.message || "Network error while executing the custom command."
        );
    } finally {
        this.isLoading = false;
    }
    },

    clearResponses() {
    this.atCommandResponse = "";
    this.isClean = true;
    },

    rebootDevice() {
    this.atcmd = "AT+CFUN=1,1";
    this.sendATCommand();

    this.atCommandResponse = "";
    this.showModal = false;
    this.isRebooting = true;
    this.countdown = 40;

    // Do the countdown
    const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown === 0) {
        clearInterval(interval);
        this.isRebooting = false;
        this.init();
        }
    }, 1000);
    },

    resetATCommands() {
    this.atcmd = "AT&F";
    this.sendATCommand();
    console.log("Resetting AT Commands");
    this.atcmd = "";
    this.atCommandResponse = "";
    this.showRebootModal();
    },
/*
    ipPassThroughEnable() {
    if (this.ipPassMode != "Unspecified") {
        if (this.ipPassMode == "ETH") {
        this.atcmd =
            // at+qmap="mpdn_rule",0,1,1,1,1,"FF:FF:FF:FF:FF:FF"
            'AT+QMAP="MPDN_RULE",0,1,0,1,1,"FF:FF:FF:FF:FF:FF"';
        this.sendATCommand();
        } else if (this.ipPassMode == "USB") {
        this.atcmd =
            'AT+QMAP="MPDN_RULE",0,1,0,3,1,"FF:FF:FF:FF:FF:FF"';
        this.sendATCommand();
        } else {
        console.error("Invalid IP Passthrough Mode");
        }
    } else {
        console.error("IP Passthrough Mode not specified");
    }
    },

    ipPassThroughDisable() {
    this.atcmd = 'AT+QMAP="MPDN_RULE",0;+QMAPWAC=1';
    this.sendATCommand();
    },

    async onBoardDNSProxyEnable() {
    this.atcmd = 'AT+QMAP="DHCPV4DNS","enable"';
    const result = await this.sendATCommand();
    if (result && result.ok) {
        await this.fetchCurrentSettings();
    }
    },

    async onBoardDNSProxyDisable() {
    this.atcmd = 'AT+QMAP="DHCPV4DNS","disable"';
    const result = await this.sendATCommand();
    if (result && result.ok) {
        await this.fetchCurrentSettings();
    }
    },

    usbNetModeChanger() {
    if (this.usbNetMode != "Unspecified") {
        if (this.usbNetMode == "RMNET") {
        this.atcmd = 'AT+QCFG="usbnet",0;';
        this.sendATCommand();
        } else if (this.usbNetMode == "ECM") {
        this.atcmd = 'AT+QCFG="usbnet",1;';
        this.sendATCommand();
        } else if (this.usbNetMode == "MBIM") {
        this.atcmd = 'AT+QCFG="usbnet",2;';
        this.sendATCommand();
        } else if (this.usbNetMode == "RNDIS") {
        this.atcmd = 'AT+QCFG="usbnet",3;';
        this.sendATCommand();
        } else {
        console.log("USB Net Mode Invalid");
        }
    } else {
        console.error("USB Net Mode not specified");
    }
    this.rebootDevice();
    },

    async fetchCurrentSettings() {
    this.fetchATCommand =
        'AT+QMAP="MPDN_RULE";+QMAP="DHCPV4DNS";+QCFG="usbnet"';

    try {
        const result = await ATCommandService.execute(this.fetchATCommand, {
        retries: 2,
        timeout: 12000,
        });

        if (!result.ok || !result.data) {
        const message = result.error
            ? result.error.message
            : 'Unable to fetch current settings.';
        this.errorMessage = message;
        console.warn('fetchCurrentSettings error:', message);
        return;
        }

        this.currentSettingsResponse = result.data;
        const currentData = result.data.split("\n");

        const getLine = (index) => (currentData[index] ? currentData[index] : '');

        const testEthpass = getLine(1).match(/\+QMAP: \"MPDN_rule\",0,0,0,0,0/);

        this.ipPassStatus = !testEthpass;

        const testDNSProxy = getLine(6).match(/\+QMAP: \"DHCPV4DNS\","enable"/);

        this.DNSProxyStatus = Boolean(testDNSProxy);

        const testUSBNet = getLine(8).match(/\+QCFG: \"usbnet\",(\d)/);

        if (testUSBNet && testUSBNet[1] !== undefined) {
        const mode = testUSBNet[1];
        if (mode === '0') {
            this.currentUsbNetMode = 'RMNET';
        } else if (mode === '1') {
            this.currentUsbNetMode = 'ECM';
        } else if (mode === '2') {
            this.currentUsbNetMode = 'MBIM';
        } else if (mode === '3') {
            this.currentUsbNetMode = 'RNDIS';
        } else {
            this.currentUsbNetMode = 'Unknown';
        }
        } else {
        this.currentUsbNetMode = 'Unknown';
        }

        this.atcmd = '';
    } catch (error) {
        this.errorMessage = error.message || 'Network error while retrieving current settings.';
        console.error('Error in fetchCurrentSettings:', error);
    }
    },

*/
    fetchTTL() {
    fetch("/cgi-bin/get_ttl_status")
        .then((res) => res.json())
        .then((data) => {
        this.ttldata = data;
        this.ttlStatus = this.ttldata.isEnabled;
        this.ttlvalue = this.ttldata.ttl;
        });
    },

    setTTL() {
    this.isLoading = true; // Set loading state while updating TTL
    const ttlval = this.newTTL;
    fetch(
        "/cgi-bin/set_ttl?" + new URLSearchParams({ ttlvalue: ttlval })
    )
        .then((res) => res.text()) // Use res.text() instead of res.json()
        .then((data) => {
        // Manually handle the response data
        console.log("Response from server:", data);
        // You can try to parse the JSON manually or handle the response as needed

        // Once TTL is updated, fetch the updated TTL data
        this.fetchTTL();
        this.isLoading = false; // Set loading state back to false
        })
        .catch((error) => {
        console.error("Error updating TTL: ", error);
        this.isLoading = false; // Ensure loading state is properly handled in case of error
        });
    },
    init() {
    //this.fetchCurrentSettings();
    this.fetchTTL();
    },
};
}
