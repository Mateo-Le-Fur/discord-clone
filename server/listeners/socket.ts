import { Server } from "socket.io";
import { server } from "../app";
import { ensureAuthenticatedOnSocketHandshake } from "../config/security.config";
import cookieParser from "cookie";
import {
  SecurityManager,
  FriendsManager,
  MessageManager,
  UserManager,
  RoomsManager,
  NamespacesManager,
} from "./index";
import {
  UpdateUserInterface,
  RoomInterface,
  MessageInterface,
  UpdateNamespaceInterface,
  DeleteUserInterface,
  FriendsInterface,
  PrivateMessageInterface,
  NamespaceInterface,
  SocketCustom,
} from "../interfaces";
import authProtect from "../config/jwt.config";
import { ExtendedError } from "socket.io/dist/namespace";
import { UserHasNamespace, Room } from "../models";
import namespaceValidator from "../validation/schema/namespace.schema";
import roomValidator from "../validation/schema/room.schema";
import joinNamespaceValidator from "../validation/schema/joinNamespace.schema";
import userValidator from "../validation/schema/user.schema";

class SocketManager {
  private _ios: Server;
  private _clients: Map<number, string>;
  private _namespacesManager: NamespacesManager;
  private _roomsManager: RoomsManager;
  private _usersManager: UserManager;
  private _messagesManager: MessageManager;
  private _friendsManager: FriendsManager;
  private _securityManager: SecurityManager;

  constructor() {
    this._ios = new Server(server, {
      allowRequest: ensureAuthenticatedOnSocketHandshake,
      maxHttpBufferSize: 1e7,
      cors: { origin: "*", credentials: true },
    });
    this._clients = new Map();
    this._namespacesManager = new NamespacesManager(this._ios, this._clients);
    this._roomsManager = new RoomsManager(this._ios);
    this._usersManager = new UserManager(this._ios, this._clients);
    this._messagesManager = new MessageManager(this._ios);
    this._friendsManager = new FriendsManager(this._ios, this._clients);
    this._securityManager = new SecurityManager(this._ios);
  }

  public init() {
    this._ios.on("connect", async (socket: SocketCustom) => {
      const id = socket.request.user?.id;
      console.log("client connected");

      if (id) this._clients.set(id, socket.id);

      try {
        await this._friendsManager.getUserFriends(socket);
        await this._friendsManager.getAllConversations(socket);
        await this._namespacesManager.getUserNamespaces(socket);
      } catch (e) {
        console.error(e);
      }

      socket.on("friendRequest", async (data: FriendsInterface, callback) => {
        try {
          await this._friendsManager.friendRequest(socket, data);
          callback({
            status: "ok",
            message: "Demande d'ami envoy??",
          });
        } catch (e) {
          if (e instanceof Error) {
            callback({
              status: "error",
              message: e.message,
            });
            console.error(e);
          }
        }
      });

      socket.on("acceptFriendRequest", async (senderId: number, callback) => {
        try {
          await this._friendsManager.acceptFriendRequest(socket, senderId);
          callback({
            status: "ok",
            message: "",
          });
        } catch (e) {
          if (e instanceof Error) {
            console.error(e);
            callback({
              status: "error",
              message: e.message,
            });
          }
        }
      });

      socket.on("declineFriendRequest", async (senderId: number) => {
        try {
          await this._friendsManager.declineFriendRequest(socket, senderId);
        } catch (e) {
          console.error(e);
        }
      });

      socket.on(
        "deleteFriend",
        async (data: { friendId: number; privateRoomId: number }) => {
          try {
            await this._friendsManager.deleteFriend(socket, data);
          } catch (e) {
            console.error(e);
          }
        }
      );

      socket.on(
        "getConversationWithAFriend",
        async (data: { friendId: number; privateRoomId: number }) => {
          try {
            await this._friendsManager.getConversationWithAFriend(socket, data);
          } catch (e) {
            console.error(e);
          }
        }
      );

      socket.on("getPrivateMessagesHistory", async (privateRoomId: number) => {
        try {
          await this._friendsManager.getPrivateMessages(socket, privateRoomId);
        } catch (e) {
          console.error(e);
        }
      });

      socket.on(
        "loadMorePrivateMessages",
        async (data: { id: number; messagesArrayLength: number }) => {
          try {
            await this._friendsManager.loadMorePrivateMessages(socket, data);
          } catch (e) {
            console.error(e);
          }
        }
      );

      socket.on("sendPrivateMessage", async (data: PrivateMessageInterface) => {
        try {
          await this._friendsManager.sendPrivateMessage(socket, data);
        } catch (e) {
          console.error(e);
        }
      });

      socket.on(
        "createNamespace",
        async (data: NamespaceInterface, callback) => {
          try {
            await namespaceValidator.validateAsync(data);
            await this._namespacesManager.createNamespace(socket, data);
            callback({
              status: "ok",
              message: "",
            });
          } catch (e) {
            if (e instanceof Error) {
              callback({
                status: "error",
                message: e.message,
              });
            }
          }
        }
      );

      socket.on(
        "userJoinNamespace",
        async (data: NamespaceInterface, callback) => {
          try {
            await joinNamespaceValidator.validateAsync(data);
            await this._namespacesManager.joinInvitation(socket, data);
            callback({
              status: "ok",
            });
          } catch (e) {
            if (e instanceof Error) {
              callback({
                status: "error",
                message: e.message,
              });
            }
          }
        }
      );

      socket.on(
        "loadMoreMessages",
        async (data: { id: number; messagesArrayLength: number }) => {
          await this._roomsManager.loadMoreMessage(socket, data);
        }
      );

      socket.on("updateUser", async (data: UpdateUserInterface, callback) => {
        try {
          await userValidator.validateAsync(data);
          await this._usersManager.updateUser(socket, data);
          callback({
            status: "ok",
          });
        } catch (e) {
          if (e instanceof Error) {
            callback({
              status: "error",
              message: e.message,
            });
          }
        }
      });

      socket.on("deleteUser", async (data: DeleteUserInterface) => {
        try {
          await this._usersManager.deleteUser(socket, data);
        } catch (e) {
          console.error(e);
        }
      });

      socket.on(
        "join",
        async (data: { namespaces: number[]; friends: number[] }) => {
          this._usersManager.connectUser(socket, data);
        }
      );

      socket.on(
        "leave",
        async (data: { namespaces: number[]; friends: number[] }) => {
          this._usersManager.disconnectUser(socket, data);
          socket.disconnect(true);
        }
      );

      socket.on("jwt_expire", (data: string) => {
        if (data) {
          try {
            const cookies = cookieParser.parse(
              socket.handshake.headers.cookie || ""
            );
            authProtect.decodedToken(cookies.jwt);
            socket.emit("jwt_expire", false);
          } catch (e) {
            console.error(e);
            socket.emit("jwt_expire", true);
          }
        }
      });

      socket.on("disconnect", () => {
        const { id } = socket.request.user!;

        if (id) this._clients.delete(id);

        console.log("disconnect home");
      });
    });

    this.initNamespace();
  }

  private initNamespace() {
    try {
      const ns = this._ios.of(/^\/\d+$/);

      ns.use(
        async (
          socket: SocketCustom,
          next: (err?: ExtendedError | undefined) => void
        ) => {
          const userId = socket.request.user?.id;
          const namespaceId = socket.nsp.name.substring(1);

          const isUserHaveAccessToTheServer = await UserHasNamespace.findOne({
            where: {
              userId,
              namespaceId,
            },
          });

          if (isUserHaveAccessToTheServer) {
            next();
          } else {
            next(new Error("Tu n'as pas acc??s ?? ce serveur "));
          }
        }
      );

      ns.on("connect", async (nsSocket: SocketCustom) => {
        console.log(
          `L'utilisateur : ${nsSocket.request.user?.pseudo} est connect?? sur le serveur ${nsSocket.nsp.name}`
        );

        try {
          const namespaceId = nsSocket.nsp.name.slice(1);
          await this._roomsManager.getAllRooms(nsSocket, namespaceId);
        } catch (e) {
          console.error(e);
        }

        nsSocket.on(
          "updateNamespace",
          async (data: UpdateNamespaceInterface, callback) => {
            try {
              await this._securityManager.checkIfUserIsAdminOfNamespace(
                nsSocket,
                data.namespaceId
              );
              await namespaceValidator.validateAsync(data);
              await this._namespacesManager.updateNamespace(nsSocket, data);
              callback({
                status: "ok",
              });
            } catch (e) {
              if (e instanceof Error) {
                callback({
                  status: "error",
                  message: e.message,
                });
              }
            }
          }
        );

        nsSocket.on(
          "deleteNamespace",
          async (data: NamespaceInterface, callback) => {
            try {
              await this._securityManager.checkIfUserIsAdminOfNamespace(
                nsSocket,
                data.id
              );
              await this._namespacesManager.deleteNamespace(nsSocket, data);
              callback({
                status: "ok",
              });
            } catch (e) {
              if (e instanceof Error) {
                callback({
                  status: "error",
                  message: e.message,
                });
              }
            }
          }
        );

        nsSocket.on(
          "userLeaveNamespace",
          async (data: NamespaceInterface, callback) => {
            try {
              await this._namespacesManager.leaveNamespace(nsSocket, data);
              callback({
                status: "ok",
              });
            } catch (e) {
              if (e instanceof Error) {
                callback({
                  status: "error",
                  message: e.message,
                });
              }
            }
          }
        );

        nsSocket.on("getNamespaceUsers", async (data: number) => {
          try {
            await this._namespacesManager.getNamespaceUsers(nsSocket, data);
          } catch (e) {
            console.error(e);
          }
        });

        nsSocket.on(
          "loadMoreUser",
          async (data: { currentArrayLength: number; namespaceId: number }) => {
            try {
              await this._namespacesManager.loadMoreUser(nsSocket, data);
            } catch (e) {
              console.error(e);
            }
          }
        );

        nsSocket.on("joinRoom", async (data) => {
          try {
            await this._roomsManager.joinRoom(nsSocket, data);
          } catch (e) {
            console.error(e);
          }
        });

        nsSocket.on("leaveRoom", (roomId: number) => {
          this._roomsManager.leaveRoom(nsSocket, roomId);
        });

        nsSocket.on("createRoom", async (data: RoomInterface, callback) => {
          try {
            await this._securityManager.checkIfUserIsAdminOfNamespace(
              nsSocket,
              data.namespaceId
            );
            await roomValidator.validateAsync(data);
            await this._roomsManager.createRoom(data);
            callback({
              status: "ok",
            });
          } catch (e) {
            if (e instanceof Error) {
              callback({
                status: "error",
                message: e.message,
              });
            }
          }
        });

        nsSocket.on("updateRoom", async (data: RoomInterface, callback) => {
          try {
            await this._securityManager.checkIfUserIsAdminOfNamespace(
              nsSocket,
              data.namespaceId
            );
            await roomValidator.validateAsync(data);
            await this._roomsManager.updateRoom(nsSocket, data);
            callback({
              status: "ok",
            });
          } catch (e) {
            if (e instanceof Error) {
              console.error(e);
              callback({
                status: "error",
                message: e.message,
              });
            }
          }
        });

        nsSocket.on("deleteRoom", async (data: RoomInterface, callback) => {
          try {
            await this._securityManager.checkIfUserIsAdminOfNamespace(
              nsSocket,
              data.namespaceId
            );
            await this._roomsManager.deleteRoom(nsSocket, data);
          } catch (e) {
            if (e instanceof Error) {
              if (typeof callback === "function")
                callback({
                  status: "error",
                  message: e.message,
                });
            }
          }
        });

        nsSocket.on("message", async (data: MessageInterface) => {
          try {
            await this._messagesManager.sendMessage(ns, nsSocket, data);
          } catch (e) {
            console.error(e);
          }
        });

        nsSocket.on("disconnect", () => {
          nsSocket.disconnect();
          console.log("disconnect");
        });
      });
    } catch (e) {
      throw e;
    }
  }
}

export default SocketManager;
