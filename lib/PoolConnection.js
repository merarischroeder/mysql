var inherits   = require('util').inherits;
var Connection = require('./Connection');
var Events     = require('events');

module.exports = PoolConnection;
inherits(PoolConnection, Connection);

function PoolConnection(pool, options) {
  Connection.call(this, options);
  this._pool  = pool;
  this.borrowedAt = new Date(); //initialise variable upfront for performance
  
  //why: so user can set this to 'longterm' if they don't expect to release it.
  //eventually, the getConnection function can support the borrowTerm as a parameter
  //and also have a proper ENUM list of values, so we can internally report 
  //neglected connections which were never released.
  this.borrowTerm = 'unknown'; 
  
  //why: now that the consumer can enumerate borrowedConnections
  //they should be able to attach context information, such as 'Report for Finance'
  //so they can report on and manage their longterm connections
  //preventing abandoned connections which were never released
  this.context = ''; 
  
  // Bind connection to pool domain
  if (Events.usingDomains) {
    if (this.domain) {
      this.domain.remove(this);
    }

    if (pool.domain) {
      pool.domain.add(this);
    }
  }

  // When a fatal error occurs the connection's protocol ends, which will cause
  // the connection to end as well, thus we only need to watch for the end event
  // and we will be notified of disconnects.
  this.on('end', this._removeFromPool);
  this.on('error', function (err) {
    if (err.fatal) {
      this._removeFromPool();
    }
  });
}

PoolConnection.prototype.release = function release() {
  var pool = this._pool;
  var connection = this;

  if (!pool || pool._closed) {
    return undefined;
  }

  return pool.releaseConnection(this);
};

// TODO: Remove this when we are removing PoolConnection#end
PoolConnection.prototype._realEnd = Connection.prototype.end;

PoolConnection.prototype.end = function () {
  console.warn( 'Calling conn.end() to release a pooled connection is '
              + 'deprecated. In next version calling conn.end() will be '
              + 'restored to default conn.end() behavior. Use '
              + 'conn.release() instead.'
              );
  this.release();
};

PoolConnection.prototype.destroy = function () {
  Connection.prototype.destroy.apply(this, arguments);
  this._removeFromPool(this);
};

PoolConnection.prototype._removeFromPool = function _removeFromPool() {
  if (!this._pool || this._pool._closed) {
    return;
  }

  var pool = this._pool;
  this._pool = null;

  pool._purgeConnection(this);
};
