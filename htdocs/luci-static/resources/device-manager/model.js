'use strict';
'require device-manager.i18n as i18n';
'require baseclass';

const ACTIVE_STATES = [ 'REACHABLE', 'DELAY', 'PROBE' ];
const STATE_PRIORITY = { REACHABLE: 6, DELAY: 5, PROBE: 4, STALE: 3, PERMANENT: 2, NOARP: 2, INCOMPLETE: 1, FAILED: 0 };

// Localize untouched defaults; user-defined names remain literal configuration data.
const DEFAULT_GROUPS = {
	smart_home: { stored: [ '智能家居', 'Smart home' ], label: () => i18n.t('Smart home') },
	phone: { stored: [ '手机设备', 'Phones' ], label: () => i18n.t('Phones') },
	computer: { stored: [ '电脑设备', 'Computers' ], label: () => i18n.t('Computers') },
	network: { stored: [ '网络设备', 'Network devices' ], label: () => i18n.t('Network devices') },
	other: { stored: [ '其他设备', 'Other devices' ], label: () => i18n.t('Other devices') }
};

const DEVICE_TYPES = {
	computer: { id: 'computer', icon: 'computer.svg', zh: '台式电脑', en: 'Computer' },
	laptop:   { id: 'laptop',   icon: 'laptop.svg',   zh: '笔记本',   en: 'Laptop' },
	phone:    { id: 'phone',    icon: 'phone.svg',    zh: '手机',     en: 'Phone' },
	tablet:   { id: 'tablet',   icon: 'tablet.svg',   zh: '平板',     en: 'Tablet' },
	tv:       { id: 'tv',       icon: 'tv.svg',       zh: '电视',     en: 'TV' },
	tvbox:    { id: 'tvbox',    icon: 'tvbox.svg',    zh: '电视盒子', en: 'TV box' },
	nas:      { id: 'nas',      icon: 'nas.svg',      zh: '网络存储', en: 'NAS' },
	printer:  { id: 'printer',  icon: 'printer.svg',  zh: '打印机',   en: 'Printer' },
	camera:   { id: 'camera',   icon: 'camera.svg',   zh: '摄像头',   en: 'Camera' },
	speaker:  { id: 'speaker',  icon: 'speaker.svg',  zh: '音箱',     en: 'Speaker' },
	game:     { id: 'game',     icon: 'game.svg',     zh: '游戏机',   en: 'Game console' },
	router:   { id: 'router',   icon: 'router.svg',   zh: '路由器',   en: 'Router' },
	switch:   { id: 'switch',   icon: 'switch.svg',   zh: '交换机',   en: 'Switch' },
	ap:       { id: 'ap',       icon: 'ap.svg',       zh: '无线AP',   en: 'Access point' },
	server:   { id: 'server',   icon: 'server.svg',   zh: '服务器',   en: 'Server' },
	plug:     { id: 'plug',     icon: 'plug.svg',     zh: '智能插座', en: 'Smart plug' },
	light:    { id: 'light',    icon: 'light.svg',    zh: '智能灯',   en: 'Smart light' },
	sensor:   { id: 'sensor',   icon: 'sensor.svg',   zh: '传感器',   en: 'Sensor' },
	home:     { id: 'home',     icon: 'home.svg',     zh: '智能家居', en: 'Smart home' },
	watch:    { id: 'watch',    icon: 'watch.svg',    zh: '智能手表', en: 'Watch' },
	car:      { id: 'car',      icon: 'car.svg',      zh: '智能汽车', en: 'Vehicle' },
	vr:       { id: 'vr',       icon: 'vr.svg',       zh: 'VR设备',   en: 'VR headset' },
	network:  { id: 'network',  icon: 'network.svg',  zh: '网络设备', en: 'Network device' },
	airconditioner: { id: 'airconditioner', icon: 'airconditioner.svg', zh: '空调', en: 'Air conditioner' },
	washer:         { id: 'washer',         icon: 'washer.svg',         zh: '洗衣机', en: 'Washing machine' },
	fridge:         { id: 'fridge',         icon: 'fridge.svg',         zh: '冰箱', en: 'Refrigerator' },
	waterpurifier:  { id: 'waterpurifier',  icon: 'waterpurifier.svg',  zh: '净水器', en: 'Water purifier' },
	airpurifier:    { id: 'airpurifier',    icon: 'airpurifier.svg',    zh: '空气净化器', en: 'Air purifier' },
	unknown:  { id: 'unknown',  icon: 'unknown.svg',  zh: '未知设备', en: 'Unknown' }
};

const OUI_MAP = {
	// NAS
	'001132': 'nas', '00089B': 'nas', '245EBE': 'nas', '001392': 'nas', '10BF48': 'nas', '6C5979': 'nas',
	// Car
	'4CFCAA': 'car', '98ED5C': 'car', '047863': 'car', '70B3D5': 'car', 'E86414': 'car', '38521A': 'car',
	'E40795': 'car', 'A0C662': 'car', '582429': 'car', '78DA07': 'car', '70F11C': 'car', 'A81B6A': 'car',
	'C4F312': 'car', 'ACBD70': 'car', '940E6B': 'car',
	// VR
	'2C2617': 'vr', '3C846A': 'vr', '68D79A': 'vr', '7C1E52': 'vr', '9C2840': 'vr', 'BC6A29': 'vr',
	'149877': 'vr', '340804': 'vr', '841826': 'vr', 'F88FD5': 'vr', '002423': 'vr', '086266': 'vr',
	'188796': 'vr', '7C6193': 'vr', '84DBAC': 'vr', 'D8B12A': 'vr', '488759': 'vr', '60A44C': 'vr',
	// Printer
	'001A4B': 'printer', '001B78': 'printer', '001E0B': 'printer', '00215A': 'printer', '0025B3': 'printer',
	'101F74': 'printer', '10604B': 'printer', '288023': 'printer', '9457A5': 'printer', 'A45D36': 'printer',
	'B499BA': 'printer', 'C8D3FF': 'printer', 'D48564': 'printer', 'E83935': 'printer', 'EC8EB5': 'printer',
	'000085': 'printer', '001E8F': 'printer', '008085': 'printer', '180CAC': 'printer', '24E271': 'printer',
	'54271E': 'printer', '708A09': 'printer', '84BA3B': 'printer', 'A48431': 'printer', 'B40C25': 'printer',
	'D8492F': 'printer', '000048': 'printer', '0021B7': 'printer', '0026AB': 'printer', '44D244': 'printer',
	'64EB8C': 'printer', 'AC1826': 'printer', 'C43655': 'printer', '008077': 'printer', '001BA9': 'printer',
	'30055C': 'printer', '40B034': 'printer', '6C96CF': 'printer', '702084': 'printer', '805EC0': 'printer',
	'88AE1D': 'printer', 'A434F1': 'printer', 'DC5360': 'printer', '0000AA': 'printer', '002673': 'printer',
	// Camera
	'001212': 'camera', '1012FB': 'camera', '2857BE': 'camera', '40B076': 'camera', '4419B6': 'camera',
	'44A642': 'camera', '5803FB': 'camera', '686DBC': 'camera', '70AF6A': 'camera', '849A40': 'camera',
	'A41437': 'camera', 'BC5436': 'camera', 'C056E3': 'camera', 'D8B04C': 'camera', 'E0508B': 'camera',
	'F84DFC': 'camera', '50EC50': 'camera', 'BCBAC2': 'camera', '38AF29': 'camera', '9002A9': 'camera',
	'A0BD1D': 'camera', 'BC325F': 'camera', 'EC71DB': 'camera', '48EA63': 'camera', '74EE2A': 'camera',
	'E0CC7A': 'camera', '2CAA8E': 'camera', '7C78B2': 'camera', 'A4DA22': 'camera', '08A6BC': 'camera',
	'343EA4': 'camera', '44650D': 'camera', '9C7613': 'camera', '300D43': 'camera', '00408C': 'camera',
	'00626E': 'camera', '001EAC': 'camera',
	// Game
	'0009BF': 'game', '001656': 'game', '0017AB': 'game', '0019FD': 'game', '001B7A': 'game',
	'001DBC': 'game', '001F32': 'game', '002147': 'game', '0022AA': 'game', '0023CC': 'game',
	'002444': 'game', '0025A0': 'game', '002659': 'game', '7CBB8A': 'game', '98B6E9': 'game',
	'A45C27': 'game', 'B87826': 'game', 'D86BF7': 'game', 'E84E06': 'game', '247189': 'game',
	'342FBD': 'game', '40D28A': 'game', '40F407': 'game', '605BB4': 'game', '64B5C6': 'game',
	'78A2A0': 'game', '8C56C5': 'game', '9458CB': 'game', 'B88AEC': 'game', 'CC9E00': 'game',
	'DC68EB': 'game', 'E0E751': 'game', 'ECC40D': 'game', 'F83F51': 'game',
	'00041F': 'game', '001315': 'game', '0015C1': 'game', '0019C5': 'game', '001D0D': 'game',
	'00248D': 'game', '709E29': 'game', 'A8E3EE': 'game', 'BC60A7': 'game', 'F8461C': 'game',
	'FC0FE6': 'game', '00014A': 'game', '001FA7': 'game', '00D9D1': 'game', '280DFC': 'game',
	'B00594': 'game', 'C863F1': 'game', 'E0AE5E': 'game', 'F0F002': 'game', '0050F2': 'game',
	'7CED8D': 'game', '985FD3': 'game', 'E0D55E': 'game', '5882A8': 'game', 'B4AE2B': 'game',
	'842519': 'game', '90B931': 'game', '001A7D': 'game',
	// Speaker
	'000E58': 'speaker', '48A6B8': 'speaker', '5CAAFD': 'speaker', '7828CA': 'speaker',
	'949F3E': 'speaker', 'B8E937': 'speaker', '347E5C': 'speaker', '000C8A': 'speaker',
	'0452C7': 'speaker', '08DF1F': 'speaker', '2C41A1': 'speaker', '40ED98': 'speaker',
	'689E19': 'speaker', '00126F': 'speaker', '001DC8': 'speaker', '04CB88': 'speaker',
	'B03829': 'speaker', '0009A7': 'speaker', '302147': 'speaker',
	// TV Box & Streaming
	'000D4A': 'tvbox', '080581': 'tvbox', '20F643': 'tvbox', '24C9A1': 'tvbox',
	'84EA99': 'tvbox', 'B0A737': 'tvbox', 'CC6DA0': 'tvbox', 'DC3A5E': 'tvbox',
	'D83134': 'tvbox', '001A11': 'tvbox', 'F4F5E8': 'tvbox', 'F40343': 'tvbox',
	'546009': 'tvbox', '00BB3A': 'tvbox', '10CEA9': 'tvbox', '149F3C': 'tvbox',
	'38F73D': 'tvbox', '40B4CD': 'tvbox', '78E103': 'tvbox', '84D6D0': 'tvbox',
	'F0F0A4': 'tvbox',
	// TV
	'001A9A': 'tv', '1048B1': 'tv', 'C80E14': 'tv', '001C62': 'tv', '203D66': 'tv',
	'447E95': 'tv', 'C825E1': 'tv', '08A5C8': 'tv', '20F478': 'tv', '40B395': 'tv',
	'C80210': 'tv', '002644': 'tv', '9CA9E4': 'tv', '002512': 'tv', '84A466': 'tv',
	// Smart Home IoT (Espressif, Tuya, Philips Hue, Shelly...)
	'18FE34': 'plug', '240AC4': 'plug', '2462AB': 'plug', '246F28': 'plug', '24DCC3': 'plug',
	'2C3AE8': 'plug', '2CF432': 'plug', '30AEA4': 'plug', '308398': 'plug', '3C6105': 'plug',
	'3C71BF': 'plug', '4022D8': 'plug', '409151': 'plug', '483FDA': 'plug', '485519': 'plug',
	'4C11AE': 'plug', '4C7525': 'plug', '500291': 'plug', '5443B2': 'plug', '545AA6': 'plug',
	'5CCF7F': 'plug', '600194': 'plug', '68C63A': 'plug', '70039F': 'plug', '7C87CE': 'plug',
	'807D3A': 'plug', '840D8E': 'plug', '84F3EB': 'plug', '8CAAB5': 'plug', '8CCE4E': 'plug',
	'9097D5': 'plug', '94B555': 'plug', '94B97E': 'plug', '98F4AB': 'plug', 'A020A6': 'plug',
	'A47B9D': 'plug', 'A4C138': 'plug', 'AC67B2': 'plug', 'B4E62D': 'plug', 'BCDDC2': 'plug',
	'C44F33': 'plug', 'C82B96': 'plug', 'CC50E3': 'plug', 'D8A01D': 'plug', 'DC4F22': 'plug',
	'E09806': 'plug', 'E8DB84': 'plug', 'ECFABC': 'plug',
	'102C6B': 'home', '10D561': 'home', '20F41B': 'home', '508A06': 'home', '68572D': 'home',
	'708976': 'home', '78EE2A': 'home', 'A09208': 'home', 'C009A0': 'home', 'DC2C26': 'home',
	'001788': 'light', 'ECB5FA': 'light', '244CAB': 'plug', '349454': 'plug', '98CDAC': 'plug',
	'B8D61A': 'plug', '34EA34': 'home', '780F77': 'home', 'B4430D': 'home',
	'54EF44': 'sensor', '703EAC': 'sensor', 'E4AAEC': 'sensor',
	'001150': 'plug', '00173F': 'plug', '001CDF': 'plug', '002275': 'plug', '08863B': 'plug',
	'149182': 'plug', '24F5A2': 'plug', '58EF68': 'plug', '6038E0': 'plug', '94103E': 'plug',
	'B4750E': 'plug', 'EC1A59': 'plug',
	// Servers / VMs
	'000569': 'server', '000C29': 'server', '001C14': 'server', '005056': 'server',
	'525400': 'server', '080027': 'server', '00163E': 'server',
	// Network equipment (Routers, APs, Switches)
	'9483C4': 'router', 'E4956E': 'router', '000C42': 'router', '488F5A': 'router',
	'64D154': 'router', '6C3B6B': 'router', '744D28': 'router', 'B869F4': 'router',
	'C4AD34': 'router', 'D4CA6D': 'router', 'DC2C6E': 'router', 'E48D8C': 'router',
	'00156D': 'ap', '002722': 'ap', '0418D6': 'ap', '0440A9': 'ap', '18E829': 'ap',
	'24A43C': 'ap', '44D9E7': 'ap', '687251': 'ap', '70A741': 'ap', '7483C2': 'ap',
	'788A20': 'ap', '802AA8': 'ap', 'B4FBE4': 'ap', 'DC9FDB': 'ap', 'E063DA': 'ap',
	'F09FC2': 'ap',
	'000FE2': 'switch', '001AE8': 'switch', '002389': 'switch', '1866DA': 'switch',
	'3822D6': 'switch', '70F96B': 'switch', '80F62E': 'switch', 'A0C589': 'switch',
	// Computer / Laptop
	'B827EB': 'computer', 'DCA632': 'computer', 'E45F01': 'computer', '28CDC1': 'computer',
	'001422': 'computer', '00188B': 'computer', '001E4F': 'computer', '00219B': 'computer',
	'0024E8': 'computer', '14FEB5': 'computer', '24B6FD': 'computer', '3417EB': 'computer',
	'44A842': 'computer', '54BF64': 'computer', '74867A': 'computer', '847BEB': 'computer',
	'90B11C': 'computer', 'A44CC8': 'computer', 'B083FE': 'computer', 'BC305B': 'computer',
	'C8F750': 'computer', 'D4BED9': 'computer', 'E454E8': 'computer', 'ECF4BB': 'computer',
	'F8DB88': 'computer', '0012FE': 'computer', '001A64': 'computer', '0021CC': 'computer',
	'083E8E': 'computer', '28D244': 'computer', '3052CB': 'computer', '4045DA': 'computer',
	'507B9D': 'computer', '54EE75': 'computer', '6099D1': 'computer', '70720D': 'computer',
	'8096B1': 'computer', '98FA9B': 'computer', 'AC74B1': 'computer', 'C85B76': 'computer',
	'D8BBC1': 'computer', '0002B3': 'computer', '000347': 'computer', '000E0C': 'computer',
	'001302': 'computer', '0013E8': 'computer', '001500': 'computer', '001676': 'computer',
	'0019D1': 'computer', '001B21': 'computer', '001CC0': 'computer', '001DE0': 'computer',
	'001E67': 'computer', '00215C': 'computer', '00216A': 'computer', '0022FA': 'computer',
	'002314': 'computer', '0024D7': 'computer', '00270E': 'computer', '3413E8': 'computer',
	'3CFDFE': 'computer', '4C79BA': 'computer', '6805CA': 'computer', '7C5CF8': 'computer',
	'84A938': 'computer', '88AEDD': 'computer', '8C8590': 'computer', '94659C': 'computer',
	'A08869': 'computer', 'A44E31': 'computer', 'B49691': 'computer', 'D89C67': 'computer',
	'E82A44': 'computer', 'EC2E98': 'computer', 'F49634': 'computer',
	'00070E': 'computer', '001022': 'computer', '001A73': 'computer', '00E04C': 'computer',
	'049226': 'computer', '207C8F': 'computer', '485D60': 'computer', '7085C2': 'computer',
	'8C882B': 'computer'
};

const OUI_MOBILE = new Set([
	'000393', '000502', '000A27', '000A95', '000D93', '0010FA', '001124', '001451', '0016CB', '0017F2',
	'0019E3', '001B63', '001CB3', '001D4F', '001E52', '001EC2', '001F5B', '001FF3', '0021E9', '002241',
	'002312', '002332', '00236C', '002436', '002500', '00254B', '0025BC', '002608', '00264A', '0026B0',
	'0026BB', '3CD92B', '406C8F', '44FB42', '4860BC', '4C3275', '600308', '60F81D', '6476BA', '705681',
	'70DEE2', '784F43', '7C6D62', '804971', '843835', '8866A5', '8C8590', '9801A7', 'A0999B', 'A483E7',
	'A4C361', 'ACBC32', 'ACDE48', 'B418D1', 'B8E856', 'BC52B7', 'BCD11F', 'C82A14', 'CC29F5', 'D023DB',
	'D0817A', 'D4619D', 'D83062', 'DC2B61', 'E05163', 'E0ACCB', 'E4CE8F', 'F01898', 'F4F15A', 'F45C89',
	'F8FFC2', '00EC0A', '04E2B9', '0C1DAF', '102AB3', '14F65A', '185936', '286C07', '348004', '38A4ED',
	'3CBD3E', '50642B', '584498', '640980', '64CC2E', '68DFDD', '742344', '7802F8', '7C1DD9', '84DBAC',
	'8CBEBE', '98FAE3', '9C99A0', 'A45046', 'ACC1EE', 'B0E235', 'C40BCB', 'C8F230', 'D4970B', 'DC2B2A',
	'E446DA', 'F460E2', 'FC643A', '001882', '001E10', '00259E', '00464B', '04254C', '047970', '0819A6',
	'0C37DC', '101B54', '104780', '145F94', '200889', '283152', '285FDB', '30D17E', '384C90', '4846FB',
	'486276', '4C5499', '548998', '60DE44', '707BE8', '74882A', '786A89', '8038BC', '84A8E4', '888603',
	'904E92', 'A47174', 'ACE87B', 'B4CD27', 'C85195', 'CC96A0', 'D03E5C', 'D46AA8', 'E01954', 'E40EEE',
	'F4559C', '0007AB', '001247', '001599', '00166C', '001A8A', '00214C', '0023D7', '002637', '08373D',
	'1077B1', '14BB6E', '18227E', '1C66AA', '244B81', '28987B', '30074D', '34C059', '380B40', '444E1A',
	'4844F7', '508569', '5492BE', '5CF6DC', '64B310', '68EBAE', '7840E4', '805B65', '88365F', '8C7712',
	'90F1AA', '94350A', '98398E', 'A0821F', 'A87C01', 'AC5F3E', 'B0C4E7', 'B479A7', 'BC4486', 'C0BDD1',
	'C819F7', 'CC07AB', 'D022BE', 'D4E6B7', 'DC7144', 'E47CF9', 'E8508B', 'EC1F72', 'F025B7', 'F47B5E',
	'F8042E', '04D6AA', '0CD746', '14F42A', '1C77F6', '3010B3', '38A28C', '446E2E', '4CB16C', '508F4C',
	'683E34', '7C03D8', '94D029', 'B4B52F', 'BC6C21', 'C0BFBE', 'DCF756', 'E02B96', 'EC0EC4', 'F8A45A',
	'009ACD', '08E689', '18550E', '247260', '30C9AB', '3CF7A4', '544E90', '6CC7EC', '7829ED', '80EA07',
	'9C2EA1', 'A444D3', 'C8D083', 'DCA971', 'F4F951'
]);

const OUI_NETWORK = new Set([
	'000AEB', '001478', '0019E0', '001D0F', '002127', '0023CD', '002586', '002719', '1027F5', '147590',
	'14CF92', '18A6F7', '1C60DE', '20DCE6', '30B5C2', '50C7BF', '54A703', '54E6FC', '60A4B7', '645601',
	'6466B3', '647002', '68FF7B', '704F57', '7405A5', '7844FD', '7C8BCA', '8416F9', '84D81B', '882593',
	'8C210A', '909A4A', '984827', '98DED0', 'A0F3C1', 'A42BB0', 'AC84C6', 'B09575', 'B0BE76', 'B40F3B',
	'B8F883', 'BC4699', 'C006C3', 'C02567', 'C0A0BB', 'C46E1F', 'D46E0E', 'D807B6', 'DCFE18', 'E4C32A',
	'E848B8', 'EC086B', 'EC172F', 'EC888F', 'F483CD', 'F4EC38', 'F81A67', '00095B', '000FB5', '00146C',
	'00184D', '001B2F', '001E2A', '001F33', '00223F', '0024B2', '0026F2', '04A151', '08028E', '0836C9',
	'100C6B', '10DA43', '1459C0', '1C4419', '200CC8', '204E7F', '20E52A', '288088', '28C68E', '2C3996',
	'30469A', '3894ED', '4494FC', '4C60DE', '5CE48C', '6CB0CE', '78D294', '803773', '841B5E', '8C3BAD',
	'9C3DCF', 'A00460', 'A040A0', 'A42B8C', 'B07FB9', 'B0B98A', 'C03F0E', 'C0FFD4', 'C40415', 'C43DC7',
	'CC40D0', 'D46E5C', 'E0469A', 'E091F5', 'E4F4C6', 'EC3091', '00000C', '000142', '000143', '000163',
	'000164', '000196', '000197', '0001C7', '0001C9', '000216', '000217', '00024A', '00024B', '00027D',
	'00027E', '0002B9', '0002BA', '0002FC', '0002FD', '00036B', '00036C', '0003A0', '0003E3', '0003E4',
	'0003FD', '0003FE', '000427', '000428', '00044D', '00044E', '00046D', '00046E', '00049A', '00049B',
	'0004C0', '0004C1', '0004DD', '0004DE', '000500', '000501', '000531', '000532', '00055E', '00055F',
	'000573', '000574', '00059A', '00059B', '000628', '000629', '000652', '000653', '0006C1', '0006C2',
	'00070D', '00070E', '00074F', '000750', '00077D', '000784', '000785', '0007B3', '0007B4', '0007EB',
	'0007EC', '000820', '000821', '00087C', '00087D', '0008A3', '0008A4', '0008E2', '0008E3', '000943',
	'000944', '00097B', '00097C', '0009B7', '0009B8', '0009E8', '0009E9', '000A41', '000A42', '000A8A',
	'000A8B', '000AB7', '000AB8', '000AF3', '000AF4', '000B45', '000B46', '000B5F', '000B60', '000B85',
	'000BBE', '000BBF', '000BFC', '000BFD', '000C30', '000C31', '000C85', '000C86', '000CCE', '000CCF',
	'000D28', '000D29', '000D65', '000D66', '000DBC', '000DBD', '000DED', '000E08', '000E09', '000E38',
	'000E39', '000E83', '000E84', '000ED6', '000ED7', '000F23', '000F24', '000F34', '000F35', '000F8F',
	'000F90', '000FE4', '000FF7', '000FF8'
]);

function getTypeInfo(type) {
	return DEVICE_TYPES[type] || DEVICE_TYPES.unknown;
}

function getTypeLabel(type, lang) {
	const info = getTypeInfo(type);
	return (lang === 'zh' ? info.zh : info.en);
}

function detectDeviceType(mac, hostname, customName, group) {
	if (!mac) return 'unknown';
	const clean = String(mac).trim().toUpperCase().replace(/[:-]/g, '');
	if (clean.length < 6) return 'unknown';
	const oui = clean.slice(0, 6);
	const text = (String(customName || '') + ' ' + String(hostname || '')).toLowerCase();

	if (/(tesla|model\s*[3ysx]|byd|nio|xpeng|li-auto|polestar|rivian|zeekr)/i.test(text)) return 'car';
	if (/(quest|oculus|pico|vive|visionpro|vr)/i.test(text)) return 'vr';
	if (/(synology|diskstation|qnap|truenas|freenas|unraid|asustor|terramaster|openmediavault|omv|nas)/i.test(text)) return 'nas';
	if (/(printer|laserjet|deskjet|epson|canon|brother|xerox|ricoh|kyocera|print)/i.test(text)) return 'printer';
	if (/(camera|cctv|ipc|cam|webcam|hikvision|dahua|reolink|uniview|ezviz|wyze|ring|imou)/i.test(text)) return 'camera';
	if (/(playstation|ps[345]|xbox|nintendo|switch|steamdeck|gamepad)/i.test(text)) return 'game';
	if (/(homepod|echo|alexa|sonos|soundbar|speaker|xiaoai|jbl|bose|harman)/i.test(text)) return 'speaker';
	if (/(appletv|apple-tv|chromecast|mibox|mi-box|firetv|fire-tv|firestick|roku|shield-tv|tvbox|tv-box|stb)/i.test(text)) return 'tvbox';
	if (/(smarttv|smart-tv|mitv|mi-tv|bravia|tizen|webos|hisense|skyworth|tcl|vizio|tv)/i.test(text)) return 'tv';
	if (/(applewatch|iwatch|galaxy-watch|smartwatch|fitbit|garmin|watch|band)/i.test(text)) return 'watch';
	if (/(ipad|tablet|tab|mediapad|pad)/i.test(text)) return 'tablet';
	if (/(macbook|laptop|thinkpad|notebook|zenbook|yoga|ideapad|matebook|surface-laptop|latitude|inspiron|precision|xps|book)/i.test(text)) return 'laptop';
	if (/(server|pve|proxmox|esxi|vmware|docker|kubernetes|k8s)/i.test(text)) return 'server';
	if (/(desktop|imac|macmini|macstudio|macpro|pc|tower|workstation|optiplex|windows)/i.test(text)) return 'computer';
	if (/(airconditioner|air-conditioner|aircon|air_cond|air-conditioning|hvac|ac-unit|ac_unit|daikin|gree|midea.*ac|aux.*ac|chigo|空调)/i.test(text)) return 'airconditioner';
	if (/(washer|washing-machine|washingmachine|dryer|laundry|洗衣机|烘干机)/i.test(text)) return 'washer';
	if (/(fridge|refrigerator|freezer|冰箱|冷柜)/i.test(text)) return 'fridge';
	if (/(waterpurifier|water-purifier|waterpuri|water.*purif|purif.*water|净水器|直饮机|净水机)/i.test(text)) return 'waterpurifier';
	if (/(airpurifier|air-purifier|airpuri|purifier|空净|空气净化)/i.test(text)) return 'airpurifier';
	if (/(iphone|galaxy|redmi|xiaomi|huawei|honor|pixel|oneplus|oppo|vivo|xperia|realme|meizu|phone|mobile)/i.test(text)) return 'phone';
	if (/(smartplug|smart-plug|socket|outlet|plug)/i.test(text)) return 'plug';
	if (/(smartlight|smart-light|light|bulb|lamp|yeelight|hue|strip)/i.test(text)) return 'light';
	if (/(sensor|temp|humidity|motion|door|window|detector)/i.test(text)) return 'sensor';
	if (/(homeassistant|hass|homebridge|aqara|gateway|hub|smart-home|smarthome)/i.test(text)) return 'home';
	if (/(accesspoint|unifi|uap|eap|[-_]ap|ap[-_]|\bap\b)/i.test(text)) return 'ap';
	if (/(switch|usw|tl-sg|交换机)/i.test(text)) return 'switch';
	if (/(router|openwrt|gateway|ax[0-9]{4}|ac[0-9]{4}|archer|asuswrt)/i.test(text)) return 'router';

	if (OUI_MAP[oui]) return OUI_MAP[oui];
	if (OUI_MOBILE.has(oui)) return 'phone';
	if (OUI_NETWORK.has(oui)) return 'router';

	if (group === 'smart_home') return 'home';
	if (group === 'phone') return 'phone';
	if (group === 'computer') return 'computer';
	if (group === 'network') return 'network';

	return 'unknown';
}

function normalizeMac(mac) {
	if (typeof mac !== 'string') return null;
	const value = mac.trim().toUpperCase().replace(/[:-]/g, '');
	if (!/^[0-9A-F]{12}$/.test(value) || /^(0{12}|F{12})$/.test(value)) return null;
	return value.match(/.{2}/g).join(':');
}

function sanitizeInput(value) {
	return value == null ? '' : String(value).replace(/[\x00-\x1f\x7f]/g, ' ').trim();
}

function sectionMac(section) {
	return normalizeMac(section.mac) || normalizeMac((section['.name'] || '').replace(/^dev_/, ''));
}

function groupName(groups, id) {
	const group = groups.find(g => g.id === id);
	return group ? group.name : i18n.t('Ungrouped');
}

function matchesDevice(device, groups, group, query) {
	if (group !== 'all' && device.group !== group) return false;
	if (!query) return true;
	const typeInfo = getTypeInfo(device.type);
	return [ device.customName, device.hostname, device.ipv4, device.ipv6, device.mac,
		device.remark, groupName(groups, device.group),
		typeInfo.zh, typeInfo.en, device.type ].some(value => String(value || '').toLowerCase().includes(query));
}

function parseDevices(data, groups) {
	const devices = new Map();
	const addresses = new Map();
	const addressInterfaces = new Map();
	const neighborStates = new Map();
	const wifi = new Set();
	const arp = new Set();
	const getEntry = mac => {
		const normalized = normalizeMac(mac);
		if (!normalized) return null;
		if (!devices.has(normalized)) devices.set(normalized, {
			mac: normalized, hostname: '', ipv4: '', ipv6: '', customName: '', remark: '',
			group: 'ungrouped', sid: null, isSaved: false, isDiscovered: false,
			status: 'unknown', statusDetail: '', type: 'unknown'
		});
		return devices.get(normalized);
	};
	const addAddress = (device, ip, preferred, iface) => {
		if (!device || typeof ip !== 'string' || !ip) return;
		// DHCPv6 may include a prefix length. Keep address matching consistent.
		const address = ip.split('/')[0].toLowerCase();
		if (!addresses.has(address)) addresses.set(address, new Set());
		addresses.get(address).add(device.mac);
		if (iface) {
			if (!addressInterfaces.has(address)) addressInterfaces.set(address, new Set());
			addressInterfaces.get(address).add(iface);
		}
		const field = address.includes(':') ? 'ipv6' : 'ipv4';
		if (!device[field] || preferred) device[field] = address;
	};
	const toArray = value => Array.isArray(value) ? value : value == null ? [] : [ value ];
	const leases = data.leases || {};
	for (const lease of [ ...toArray(leases.dhcp_leases), ...toArray(leases.dhcp6_leases) ]) {
		const device = getEntry(lease.macaddr);
		if (!device) continue;
		device.isDiscovered = true;
		device.hostname = sanitizeInput(lease.hostname || device.hostname);
		for (const ip of [ ...toArray(lease.ipaddr), ...toArray(lease.ip6addrs || lease.ip6addr) ]) addAddress(device, ip);
	}
	for (const [ mac, hint ] of Object.entries(data.hints || {})) {
		const device = getEntry(mac);
		if (!device || !hint || typeof hint !== 'object') continue;
		device.isDiscovered = true;
		if (!device.hostname) device.hostname = sanitizeInput(hint.name);
		for (const ip of [ ...toArray(hint.ipaddrs || hint.ipv4), ...toArray(hint.ip6addrs || hint.ipv6) ]) addAddress(device, ip);
	}
	for (const section of data.devices || []) {
		const device = getEntry(sectionMac(section));
		if (!device) continue;
		device.isSaved = true;
		device.sid = section['.name'];
		device.customName = sanitizeInput(section.name);
		device.remark = sanitizeInput(section.remark);
		device.group = groups.some(g => g.id === section.group) ? section.group : 'ungrouped';
		if (section.type) device.customType = sanitizeInput(section.type);
	}
	for (const station of data.wifi || []) {
		const device = getEntry(typeof station === 'string' ? station : station.mac);
		if (!device) continue;
		device.isDiscovered = true;
		wifi.add(device.mac);
	}
	for (const entry of data.arp || []) {
		const device = getEntry(entry.mac);
		if (!device) continue;
		device.isDiscovered = true;
		addAddress(device, entry.ip, false, entry.dev);
		if (Number(entry.flags) === 2) arp.add(device.mac);
	}
	const neighbors = (data.neighbors || {}).neighbors || [];
	// Index all resolved neighbors first, so FAILED association is order independent.
	for (const neighbor of neighbors) {
		const device = getEntry(neighbor.mac);
		if (!device) continue;
		device.isDiscovered = true;
		addAddress(device, neighbor.ip, ACTIVE_STATES.includes(neighbor.state), neighbor.dev);
	}
	for (const neighbor of neighbors) {
		let mac = normalizeMac(neighbor.mac);
		if (!mac && typeof neighbor.ip === 'string') {
			const address = neighbor.ip.split('/')[0].toLowerCase();
			const interfaces = addressInterfaces.get(address);
			if (neighbor.dev && interfaces && !interfaces.has(neighbor.dev)) continue;
			const owners = addresses.get(address);
			// Never attach a failure to an ambiguous or reassigned address.
			if (owners && owners.size === 1) mac = owners.values().next().value;
		}
		if (!mac || !devices.has(mac)) continue;
		const state = String(neighbor.state || '').toUpperCase();
		const previous = neighborStates.get(mac);
		if (previous == null || (STATE_PRIORITY[state] ?? -1) > (STATE_PRIORITY[previous] ?? -1)) neighborStates.set(mac, state);
	}
	const complete = data.discoveryComplete === true;
	for (const device of devices.values()) {
		device.type = (device.customType && device.customType !== 'auto')
			? device.customType
			: detectDeviceType(device.mac, device.hostname, device.customName, device.group);
		const state = neighborStates.get(device.mac);
		if (wifi.has(device.mac)) {
			device.status = 'online';
			device.statusDetail = i18n.t('Active Wi-Fi association');
		} else if (ACTIVE_STATES.includes(state)) {
			device.status = 'online';
			device.statusDetail = i18n.t('Active network neighbor (%s)').format(state);
		} else if (state === 'FAILED') {
			device.status = 'offline';
			device.statusDetail = i18n.t('Network neighbor probe failed (FAILED)');
		} else if (!complete) {
			device.statusDetail = i18n.t('Some discovery sources are unavailable');
		} else if (!device.isDiscovered && !state && device.isSaved) {
			device.status = 'offline';
			device.statusDetail = i18n.t('Saved device not found in the current network');
		} else if (state) {
			device.statusDetail = i18n.t('No recent activity confirmed (%s)').format(state);
		} else if (arp.has(device.mac)) {
			device.statusDetail = i18n.t('ARP record exists without recent activity evidence');
		} else {
			device.statusDetail = i18n.t('Known device without recent activity evidence');
		}
	}
	const statusOrder = { online: 0, unknown: 1, offline: 2 };
	return Array.from(devices.values()).sort((a, b) => {
		if (a.status !== b.status) return statusOrder[a.status] - statusOrder[b.status];
		if (!!a.ipv4 !== !!b.ipv4) return a.ipv4 ? -1 : 1;
		if (a.ipv4 && b.ipv4) {
			const left = a.ipv4.split('.').map(Number), right = b.ipv4.split('.').map(Number);
			for (let i = 0; i < 4; i++) if (left[i] !== right[i]) return left[i] - right[i];
		}
		return a.mac.localeCompare(b.mac);
	});
}

function parseIpv4(ip) {
	if (!ip || typeof ip !== 'string') return null;
	const parts = ip.split('.').map(Number);
	if (parts.length !== 4 || parts.some(n => isNaN(n) || n < 0 || n > 255)) return null;
	return parts;
}

function sortDevices(devices, sortKey, sortDir, getGroupName) {
	if (!sortKey || !Array.isArray(devices)) return devices || [];
	const dir = (sortDir === 'desc') ? -1 : 1;
	return devices.slice().sort((a, b) => {
		if (sortKey === 'ip') {
			const pa = parseIpv4(a.ipv4);
			const pb = parseIpv4(b.ipv4);
			// Devices with valid IPv4 always appear before devices without IPv4
			if (Boolean(pa) !== Boolean(pb)) {
				return pa ? -1 : 1;
			}
			if (pa && pb) {
				for (let i = 0; i < 4; i++) {
					if (pa[i] !== pb[i]) return (pa[i] - pb[i]) * dir;
				}
			}
			// Both lack IPv4 (or identical IPv4): check IPv6
			const v6a = a.ipv6 || '';
			const v6b = b.ipv6 || '';
			if (Boolean(v6a) !== Boolean(v6b)) {
				return v6a ? -1 : 1;
			}
			if (v6a && v6b) {
				const cmpV6 = v6a.localeCompare(v6b);
				if (cmpV6 !== 0) return cmpV6 * dir;
			}
			// Tie-breaker: MAC
			return (a.mac || '').localeCompare(b.mac || '') * dir;
		}

		if (sortKey === 'name') {
			const nameA = a.customName || a.hostname || '';
			const nameB = b.customName || b.hostname || '';
			if (Boolean(nameA) !== Boolean(nameB)) return nameA ? -1 : 1;
			if (nameA && nameB) {
				const cmp = nameA.localeCompare(nameB);
				if (cmp !== 0) return cmp * dir;
			}
			return (a.mac || '').localeCompare(b.mac || '') * dir;
		}

		if (sortKey === 'mac') {
			return (a.mac || '').localeCompare(b.mac || '') * dir;
		}

		if (sortKey === 'group') {
			const gA = (typeof getGroupName === 'function' ? getGroupName(a.group) : a.group) || '';
			const gB = (typeof getGroupName === 'function' ? getGroupName(b.group) : b.group) || '';
			if (Boolean(gA) !== Boolean(gB)) return gA ? -1 : 1;
			if (gA && gB) {
				const cmp = gA.localeCompare(gB);
				if (cmp !== 0) return cmp * dir;
			}
			return (a.mac || '').localeCompare(b.mac || '') * dir;
		}

		if (sortKey === 'type') {
			const tA = a.type || '';
			const tB = b.type || '';
			if (tA !== tB) return tA.localeCompare(tB) * dir;
			return (a.mac || '').localeCompare(b.mac || '') * dir;
		}

		return 0;
	});
}

return baseclass.extend({
	DEVICE_TYPES: DEVICE_TYPES,
	detectDeviceType: detectDeviceType,
	getTypeInfo: getTypeInfo,
	getTypeLabel: getTypeLabel,
	normalizeMac: normalizeMac,
	sanitizeInput: sanitizeInput,
	sectionMac: sectionMac,
	getSectionId: mac => 'dev_' + normalizeMac(mac).replace(/:/g, '').toLowerCase(),
	groupName: groupName,
	matchesDevice: matchesDevice,
	parseDevices: parseDevices,
	sortDevices: sortDevices,
	parseGroups: sections => (sections || []).map(section => {
		const id = section['.name'], name = sanitizeInput(section.name) || id;
		const defaults = DEFAULT_GROUPS[id];
		return { id: id, name: defaults && defaults.stored.includes(name) ? defaults.label() : name };
	}),
	parseArp: content => String(content || '').trim().split('\n').slice(1).map(line => {
		const fields = line.trim().split(/\s+/);
		return { ip: fields[0], flags: fields[2], mac: fields[3], dev: fields[5] };
	}).filter(entry => entry.dev && normalizeMac(entry.mac))
});
