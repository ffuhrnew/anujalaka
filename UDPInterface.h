#include <Reticulum.h>
#include <Interface.h>
#include <Log.h>
#include <Bytes.h>
#include <WiFiUdp.h>

#define UDP_LOCAL_HOST "0.0.0.0"
#define UDP_REMOTE_HOST "255.255.255.255"
#define UDP_PORT 4242

//#include "Remote.h"
extern WiFiUDP udp;

#if defined(HAS_RNS) && defined(UDP_TRANSPORT)
// CBA UDP interface
class UDPInterface : public RNS::InterfaceImpl {
public:
	UDPInterface(const char *name) : RNS::InterfaceImpl(name) {
		_IN = true;
		_OUT = true;
		_HW_MTU = 1064;
	}
	UDPInterface() : UDPInterface("UDPInterface") {}
	virtual ~UDPInterface() {
		_name = "deleted";
	}
protected:
	virtual void handle_incoming(const RNS::Bytes& data) {
    TRACEF("UDPInterface.handle_incoming: (%u bytes) data: %s", data.size(), data.toHex().c_str());
    TRACE("UDPInterface.handle_incoming: sending packet to rns...");
    try {
      InterfaceImpl::handle_incoming(data);
    }
    catch (const std::bad_alloc&) {
      ERROR("UDPInterface::handle_incoming: bad_alloc - out of memory");
    }
    catch (std::exception& e) {
      ERRORF("UDPInterface::handle_incoming: %s", e.what());
    }
  }
	virtual void send_outgoing(const RNS::Bytes& data) {
    // CBA NOTE header will be addded later by transmit function
    TRACEF("UDPInterface.send_outgoing: (%u bytes) data: %s", data.size(), data.toHex().c_str());
    try {
      udp.beginPacket(UDP_REMOTE_HOST, UDP_PORT);
      udp.write(data.data(), data.size());
      udp.endPacket();
      // Perform post-send housekeeping
      InterfaceImpl::handle_outgoing(data);
    }
    catch (const std::bad_alloc&) {
      ERROR("UDPInterface::send_outgoing: bad_alloc - out of memory");
    }
    catch (std::exception& e) {
      ERRORF("UDPInterface::send_outgoing: %s", e.what());
    }
  }
};
#endif